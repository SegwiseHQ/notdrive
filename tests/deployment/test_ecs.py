import copy
import importlib.util
from pathlib import Path
import types
import unittest

spec = importlib.util.spec_from_file_location('ecs', Path(__file__).parents[2] / 'scripts/ecs.py')
ecs = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ecs)

OLD = ecs.REPOSITORY + '@sha256:' + 'a' * 64
IMAGE = ecs.REPOSITORY + '@sha256:' + 'b' * 64
REVISION = f'arn:aws:ecs:{ecs.REGION}:{ecs.ACCOUNT}:task-definition/{ecs.FAMILY}:'
EXECUTION = f'arn:aws:iam::{ecs.ACCOUNT}:role/notdrive/notdrive-ecs-execution'
TASK_ROLE = f'arn:aws:iam::{ecs.ACCOUNT}:role/notdrive/notdrive-ecs-task'


def live_task():
    payload = ecs.definition(OLD, EXECUTION, TASK_ROLE, ecs.REQUIRED)
    tags = payload.pop('tags')
    payload['taskDefinitionArn'] = REVISION + '1'
    return {'taskDefinition': payload, 'tags': tags + [{'key': 'aws:cloudformation:stack-id', 'value': 'old'}]}


class FakeAws:
    def __init__(self, count=0):
        self.calls = []
        self.task = live_task()
        self.configured = ecs.REQUIRED.copy()
        self.account = ecs.ACCOUNT
        self.service = {
            'serviceName': ecs.SERVICE, 'status': 'ACTIVE',
            'clusterArn': f'arn:aws:ecs:{ecs.REGION}:{ecs.ACCOUNT}:cluster/{ecs.CLUSTER}',
            'taskDefinition': REVISION + '1', 'desiredCount': count,
            'runningCount': count, 'pendingCount': 0,
            'deploymentConfiguration': {'minimumHealthyPercent': 0, 'maximumPercent': 100},
        }
        self.concurrent = False
        self.rollback = False
        self.waited = False

    def __call__(self, service, operation, /, **payload):
        self.calls.append((service, operation, copy.deepcopy(payload)))
        if operation == 'get-caller-identity':
            return {'Account': self.account}
        if operation == 'describe-images':
            return {'imageDetails': [{'imageDigest': 'sha256:' + 'b' * 64}]}
        if operation == 'describe-parameters':
            return {'Parameters': [{'Name': ecs.PREFIX + key} for key in sorted(self.configured)]}
        if operation == 'describe-services':
            current = copy.deepcopy(self.service)
            if self.concurrent and sum(c[1] == operation for c in self.calls) == 2:
                current['desiredCount'] = 1
            return {'services': [current], 'failures': []}
        if operation == 'describe-task-definition':
            return copy.deepcopy(self.task)
        if operation == 'register-task-definition':
            return {'taskDefinition': {'taskDefinitionArn': REVISION + '2'}}
        if operation == 'update-service':
            self.service['taskDefinition'] = payload['taskDefinition']
            return {}
        raise AssertionError((service, operation, payload))

    def wait(self):
        self.waited = True
        if self.rollback:
            self.service['taskDefinition'] = REVISION + '1'

    def mutations(self):
        return [c for c in self.calls if c[1] in ('register-task-definition', 'update-service')]


class DeploymentTests(unittest.TestCase):
    def test_both_images_are_immutable_and_count_is_preserved(self):
        for count in (0, 1):
            with self.subTest(count=count):
                aws = FakeAws(count)
                result = ecs.deploy(aws, 'c' * 40)
                self.assertEqual(result['desired_count'], count)
                registered = next(c[2] for c in aws.calls if c[1] == 'register-task-definition')
                self.assertEqual([c['image'] for c in registered['containerDefinitions']], [IMAGE, IMAGE])
                self.assertEqual(registered['executionRoleArn'], EXECUTION)
                self.assertEqual(registered['taskRoleArn'], TASK_ROLE)
                self.assertEqual(registered['tags'], ecs.TAGS)
                update = next(c[2] for c in aws.calls if c[1] == 'update-service')
                self.assertNotIn('desiredCount', update)
                self.assertTrue(aws.waited)
                self.assertFalse(any(c[1] in ('run-task', 'get-parameter', 'get-parameters', 'get-parameters-by-path') for c in aws.calls))
                self.assertFalse(any(c[0] == 'cloudformation' for c in aws.calls))

    def test_incorrect_account_stops_before_mutation(self):
        aws = FakeAws()
        aws.account = '000000000000'
        with self.assertRaisesRegex(ecs.DeploymentError, 'account'):
            ecs.deploy(aws, 'c' * 40)
        self.assertEqual(aws.mutations(), [])

    def test_invalid_tag_stops_before_any_api_call(self):
        aws = FakeAws()
        with self.assertRaises(ecs.DeploymentError):
            ecs.deploy(aws, 'latest')
        self.assertEqual(aws.calls, [])

    def test_missing_and_unknown_configuration_stop_before_registration(self):
        for configured in (ecs.REQUIRED - {'SESSION_SECRET'}, ecs.REQUIRED | {'TYPO'}):
            aws = FakeAws()
            aws.configured = configured
            with self.assertRaises(ecs.DeploymentError):
                ecs.deploy(aws, 'c' * 40)
            self.assertEqual(aws.mutations(), [])

    def test_removed_optional_setting_requires_explicit_rollback(self):
        aws = FakeAws()
        aws.task['taskDefinition']['containerDefinitions'][1]['secrets'].append({
            'name': 'ALLOWED_EMAIL_DOMAINS', 'valueFrom': ecs.parameter_arn('ALLOWED_EMAIL_DOMAINS'),
        })
        with self.assertRaisesRegex(ecs.DeploymentError, 'removed'):
            ecs.deploy(aws, 'c' * 40)
        self.assertEqual(aws.mutations(), [])

    def test_runtime_mode_commands_family_and_dependencies_are_guarded(self):
        changes = [
            lambda t: t.update(family='billgates-prod-task'),
            lambda t: t['runtimePlatform'].update(cpuArchitecture='X86_64'),
            lambda t: t['containerDefinitions'][1].update(dependsOn=[]),
            lambda t: t['containerDefinitions'][0].update(command=['node', 'dist/index.js']),
            lambda t: t['containerDefinitions'][1]['environment'].append({'name': 'SKIP_MIGRATE', 'value': '0'}),
        ]
        for change in changes:
            with self.subTest(change=change):
                aws = FakeAws()
                change(aws.task['taskDefinition'])
                with self.assertRaises(ecs.DeploymentError):
                    ecs.deploy(aws, 'c' * 40)
                self.assertEqual(aws.mutations(), [])

    def test_concurrent_count_change_does_not_update_service(self):
        aws = FakeAws()
        aws.concurrent = True
        with self.assertRaisesRegex(ecs.DeploymentError, 'concurrently'):
            ecs.deploy(aws, 'c' * 40)
        self.assertFalse(any(c[1] == 'update-service' for c in aws.calls))

    def test_ecs_rollback_is_reported_as_failure(self):
        aws = FakeAws(1)
        aws.rollback = True
        with self.assertRaisesRegex(ecs.DeploymentError, 'rollback'):
            ecs.deploy(aws, 'c' * 40)

    def test_multiple_replicas_require_review(self):
        aws = FakeAws(2)
        with self.assertRaises(ecs.DeploymentError):
            ecs.deploy(aws, 'c' * 40)
        self.assertEqual(aws.mutations(), [])

    def test_overlapping_deployment_settings_require_review(self):
        aws = FakeAws(1)
        aws.service['deploymentConfiguration']['maximumPercent'] = 200
        with self.assertRaisesRegex(ecs.DeploymentError, 'overlapping migrations'):
            ecs.deploy(aws, 'c' * 40)
        self.assertEqual(aws.mutations(), [])

    def test_ssm_overrides_remove_duplicate_default_env_and_keep_migration_db_only(self):
        aws = FakeAws()
        aws.configured |= {'DATABASE_SSL', 'ALLOWED_EMAIL_DOMAINS'}
        ecs.deploy(aws, 'c' * 40)
        registered = next(c[2] for c in aws.calls if c[1] == 'register-task-definition')
        for container in registered['containerDefinitions']:
            names = {s['name'] for s in container['secrets']}
            self.assertFalse(names & {e['name'] for e in container['environment']})
            if container['name'] == 'notdrive-migrate':
                self.assertEqual(names, {'DATABASE_URL', 'DATABASE_SSL'})
            else:
                self.assertIn('ALLOWED_EMAIL_DOMAINS', names)


class BootstrapAws(FakeAws):
    def __init__(self):
        super().__init__()
        self.bootstrap_mode = True
        self.cert_status = 'ISSUED'
        self.cert_domain = 'api.example.com'
        self.priority_taken = False

    def __call__(self, service, operation, /, **payload):
        static = {
            'describe-clusters': {'clusters': [{'status': 'ACTIVE'}]},
            'describe-listeners': {'Listeners': [{'Protocol': 'HTTPS', 'LoadBalancerArn': 'alb'}]},
            'describe-load-balancers': {'LoadBalancers': [{'Type': 'application', 'VpcId': 'vpc', 'SecurityGroups': ['alb-sg']}]},
            'describe-subnets': {'Subnets': [{'VpcId': 'vpc'}, {'VpcId': 'vpc'}]},
            'describe-listener-certificates': {'Certificates': [{'CertificateArn': 'cert'}]},
            'describe-log-groups': {'logGroups': []},
            'list-roles': {'Roles': []},
            'create-security-group': {'GroupId': 'task-sg'},
            'create-target-group': {'TargetGroups': [{'TargetGroupArn': 'target'}]},
            'create-rule': {'Rules': [{'RuleArn': 'rule'}]},
            'create-service': {},
        }
        if operation == 'describe-services':
            self.calls.append((service, operation, payload))
            return {'services': [], 'failures': [{'reason': 'MISSING'}]}
        if operation == 'describe-security-groups':
            self.calls.append((service, operation, payload))
            return {'SecurityGroups': [{'VpcId': 'vpc'}] if 'GroupIds' in payload else []}
        if operation == 'describe-rules':
            self.calls.append((service, operation, payload))
            return {'Rules': [{'Priority': '21', 'Conditions': []}] if self.priority_taken else []}
        if operation == 'describe-certificate':
            self.calls.append((service, operation, payload))
            return {'Certificate': {'Status': self.cert_status, 'SubjectAlternativeNames': [self.cert_domain]}}
        if operation == 'create-role':
            self.calls.append((service, operation, payload))
            return {'Role': {'Arn': EXECUTION if payload['RoleName'].endswith('execution') else TASK_ROLE}}
        if operation in static or operation in {'put-retention-policy', 'create-log-group', 'put-role-policy',
                                               'revoke-security-group-egress', 'authorize-security-group-egress',
                                               'authorize-security-group-ingress', 'modify-target-group-attributes'}:
            self.calls.append((service, operation, payload))
            return copy.deepcopy(static.get(operation, {}))
        return super().__call__(service, operation, **payload)


class BootstrapTests(unittest.TestCase):
    def args(self):
        return types.SimpleNamespace(image_uri=IMAGE, listener_arn='listener', listener_priority=21,
                                     api_domain='api.example.com', database_security_group='db-sg',
                                     database_port=5437, subnets=['private-a', 'private-b'], parameter_kms_key_arn=None)

    def test_bootstrap_creates_zero_task_private_service(self):
        aws = BootstrapAws()
        result = ecs.bootstrap(aws, self.args())
        self.assertEqual(result['desired_count'], 0)
        service = next(c[2] for c in aws.calls if c[1] == 'create-service')
        self.assertEqual(service['desiredCount'], 0)
        self.assertEqual(service['networkConfiguration']['awsvpcConfiguration']['assignPublicIp'], 'DISABLED')
        self.assertEqual(service['deploymentConfiguration']['maximumPercent'], 100)
        self.assertFalse(any(c[1] == 'run-task' or c[0] == 'cloudformation' for c in aws.calls))
        permission = next(c[2] for c in aws.calls if c[1] == 'put-role-policy')
        self.assertIn(ecs.parameter_arn('SESSION_SECRET'), permission['PolicyDocument'])
        self.assertNotIn('ssm:GetParametersByPath', permission['PolicyDocument'])

    def test_certificate_or_listener_conflict_stops_before_mutation(self):
        for attribute, value in [('cert_status', 'PENDING_VALIDATION'), ('cert_domain', '*.other.com'), ('priority_taken', True)]:
            aws = BootstrapAws()
            setattr(aws, attribute, value)
            with self.assertRaises(ecs.DeploymentError):
                ecs.bootstrap(aws, self.args())
            self.assertFalse(any(c[1].startswith(('create-', 'put-', 'authorize-', 'register-')) for c in aws.calls))

    def test_existing_service_is_never_rebootstrapped(self):
        aws = FakeAws(1)
        with self.assertRaisesRegex(ecs.DeploymentError, 'already exists'):
            ecs.bootstrap(aws, self.args())
        self.assertEqual(aws.mutations(), [])


if __name__ == '__main__':
    unittest.main()
