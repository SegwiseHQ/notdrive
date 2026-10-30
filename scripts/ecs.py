"""Bootstrap or release Notdrive on ECS using the AWS CLI; never reads env files."""

import argparse
import copy
import json
import os
import re
import subprocess
import sys
from pathlib import Path

ACCOUNT = '302693472565'
REGION = 'ap-south-1'
CLUSTER = 'dashboard-server'
SERVICE = 'notdrive-api-service'
FAMILY = 'notdrive-api'
REPO_NAME = 'api-notdrive'
REPOSITORY = f'{ACCOUNT}.dkr.ecr.{REGION}.amazonaws.com/{REPO_NAME}'
PREFIX = '/segwise/notdrive/runtime/'
LOG_GROUP = '/ecs/notdrive/api'
REQUIRED = {
    'DATABASE_URL', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET',
    'GOOGLE_OAUTH_REDIRECT_URI', 'APP_ENCRYPTION_KEY', 'SESSION_SECRET',
    'API_ORIGIN', 'WEB_ORIGIN',
}
OPTIONAL = {'LOG_LEVEL', 'DATABASE_SSL', 'DATABASE_SSL_CA', 'DRIVE_TREE_DEPTH', 'ALLOWED_EMAIL_DOMAINS'}
DATABASE_PARAMETERS = {'DATABASE_URL', 'DATABASE_SSL', 'DATABASE_SSL_CA', 'LOG_LEVEL'}
REGISTER_FIELDS = {
    'family', 'taskRoleArn', 'executionRoleArn', 'networkMode',
    'containerDefinitions', 'volumes', 'placementConstraints',
    'requiresCompatibilities', 'cpu', 'memory', 'ephemeralStorage', 'runtimePlatform',
    'ipcMode', 'pidMode', 'proxyConfiguration', 'inferenceAccelerators', 'enableFaultInjection',
}
TAGS = [{'key': 'Service', 'value': 'notdrive'}]


class DeploymentError(RuntimeError):
    pass


class Aws:
    def __call__(self, service, operation, /, **payload):
        command = ['aws', service, operation, '--region', REGION,
                   '--output', 'json', '--no-cli-pager']
        if payload:
            command += ['--cli-input-json', json.dumps(payload)]
        result = subprocess.run(command, check=True, text=True, capture_output=True)
        return json.loads(result.stdout) if result.stdout.strip() else {}

    def wait(self):
        subprocess.run(['aws', 'ecs', 'wait', 'services-stable', '--region', REGION,
                        '--cluster', CLUSTER, '--services', SERVICE], check=True, timeout=660)


def identity(aws):
    if aws('sts', 'get-caller-identity').get('Account') != ACCOUNT:
        raise DeploymentError('Unexpected AWS account')


def parameters(aws):
    """Enumerate metadata only; never request/decrypt parameter values."""
    result = aws('ssm', 'describe-parameters', ParameterFilters=[{
        'Key': 'Name', 'Option': 'BeginsWith', 'Values': [PREFIX],
    }])
    names = {p['Name'].removeprefix(PREFIX) for p in result.get('Parameters', [])}
    if REQUIRED - names:
        raise DeploymentError('Missing SSM parameters: ' + ', '.join(sorted(REQUIRED - names)))
    if names - REQUIRED - OPTIONAL:
        raise DeploymentError('Unsupported SSM parameters: ' + ', '.join(sorted(names - REQUIRED - OPTIONAL)))
    return names


def image_uri(value):
    if not re.fullmatch(re.escape(REPOSITORY) + r'@sha256:[0-9a-f]{64}', value):
        raise DeploymentError('Use an immutable api-notdrive ECR image digest')
    return value


def task_arn(value):
    if not isinstance(value, str) or not re.fullmatch(
        rf'arn:aws:ecs:{REGION}:{ACCOUNT}:task-definition/{FAMILY}:[0-9]+', value
    ):
        raise DeploymentError('Unexpected Notdrive task definition ARN')
    return value


def parameter_arn(name):
    return f'arn:aws:ssm:{REGION}:{ACCOUNT}:parameter{PREFIX}{name}'


def definition(image, execution_role, task_role, configured):
    containers = []
    for name in ('notdrive-migrate', 'notdrive-api'):
        migrate = name == 'notdrive-migrate'
        names = configured & DATABASE_PARAMETERS if migrate else configured
        container = {
            'name': name, 'image': image, 'essential': not migrate,
            'command': ['node', 'dist/migrate.js' if migrate else 'dist/index.js'],
            'readonlyRootFilesystem': True,
            'linuxParameters': {'capabilities': {'drop': ['ALL']}},
            'stopTimeout': 30,
            'environment': [{'name': key, 'value': value} for key, value in {
                'NODE_ENV': 'production', 'PORT': '3000', 'DB_DRIVER': 'postgres',
                'SKIP_MIGRATE': '1', 'DATABASE_SSL': 'require',
                'DATABASE_SSL_CA': '/etc/ssl/rds-global-bundle.pem',
            }.items() if key not in names],
            'secrets': [{'name': key, 'valueFrom': parameter_arn(key)} for key in sorted(names)],
            'logConfiguration': {'logDriver': 'awslogs', 'options': {
                'awslogs-group': LOG_GROUP, 'awslogs-region': REGION,
                'awslogs-stream-prefix': name, 'mode': 'non-blocking', 'max-buffer-size': '4m',
            }},
        }
        if not migrate:
            container.update({
                'dependsOn': [{'containerName': 'notdrive-migrate', 'condition': 'SUCCESS'}],
                'startTimeout': 120,
                'portMappings': [{'containerPort': 3000, 'protocol': 'tcp'}],
                'healthCheck': {
                    'command': ['CMD', 'curl', '-fsS', 'http://127.0.0.1:3000/health'],
                    'interval': 30, 'timeout': 5, 'retries': 3, 'startPeriod': 30,
                },
            })
        containers.append(container)
    return {
        'family': FAMILY, 'networkMode': 'awsvpc', 'requiresCompatibilities': ['FARGATE'],
        'runtimePlatform': {'cpuArchitecture': 'ARM64', 'operatingSystemFamily': 'LINUX'},
        'cpu': '512', 'memory': '1024', 'executionRoleArn': execution_role,
        'taskRoleArn': task_role, 'containerDefinitions': containers, 'tags': TAGS,
    }


def snapshot(aws):
    response = aws('ecs', 'describe-services', cluster=CLUSTER, services=[SERVICE])
    rows = response.get('services', [])
    if response.get('failures') or len(rows) != 1:
        raise DeploymentError('Bootstrap the Notdrive ECS service before releasing')
    service = rows[0]
    if (service.get('serviceName') != SERVICE or service.get('status') != 'ACTIVE'
            or service.get('clusterArn') != f'arn:aws:ecs:{REGION}:{ACCOUNT}:cluster/{CLUSTER}'
            or service.get('desiredCount') not in (0, 1)):
        raise DeploymentError('Expected the Notdrive service with desired count zero or one')
    task_arn(service.get('taskDefinition'))
    config = service.get('deploymentConfiguration', {})
    if config.get('minimumHealthyPercent') != 0 or config.get('maximumPercent') != 100:
        raise DeploymentError('Keep stop-before-start deployment settings to avoid overlapping migrations')
    return service


def registration(response, image, configured):
    current = response['taskDefinition']
    task_arn(current.get('taskDefinitionArn'))
    containers = current.get('containerDefinitions', [])
    if (current.get('family') != FAMILY or current.get('networkMode') != 'awsvpc'
            or current.get('requiresCompatibilities') != ['FARGATE']
            or current.get('runtimePlatform', {}).get('cpuArchitecture') != 'ARM64'
            or len(containers) != 2
            or {c['name'] for c in containers} != {'notdrive-api', 'notdrive-migrate'}):
        raise DeploymentError('Unexpected task family, containers or platform')
    payload = copy.deepcopy({k: v for k, v in current.items() if k in REGISTER_FIELDS})
    for container in payload['containerDefinitions']:
        image_uri(container['image'])
        name = container['name']
        migrate = name == 'notdrive-migrate'
        environment = {p['name']: p['value'] for p in container.get('environment', [])}
        if any(environment.get(k) != v for k, v in {
            'NODE_ENV': 'production', 'SKIP_MIGRATE': '1', 'DB_DRIVER': 'postgres', 'PORT': '3000',
        }.items()):
            raise DeploymentError('Runtime mode or migration bypass changed')
        if container.get('command') != ['node', 'dist/migrate.js' if migrate else 'dist/index.js']:
            raise DeploymentError('Unexpected container command')
        if (container.get('essential') != (not migrate) or (not migrate and
                container.get('dependsOn') != [{'containerName': 'notdrive-migrate', 'condition': 'SUCCESS'}])):
            raise DeploymentError('API must depend on a successful nonessential migration container')
        names = configured & DATABASE_PARAMETERS if migrate else configured
        previous = {s['name'] for s in container.get('secrets', [])}
        if previous - names:
            raise DeploymentError('Previously referenced SSM parameters were removed')
        # Preserve roles, resources, commands, health checks, and other container settings.
        container['image'] = image
        container['environment'] = [p for p in container.get('environment', []) if p['name'] not in names]
        container['secrets'] = [{'name': key, 'valueFrom': parameter_arn(key)} for key in sorted(names)]
    payload['tags'] = [t for t in response.get('tags', []) if not t['key'].startswith('aws:')]
    return payload


def deploy(aws, commit):
    if not re.fullmatch(r'[0-9a-f]{40}', commit):
        raise DeploymentError('Image tag must be a full commit SHA')
    identity(aws)
    images = aws('ecr', 'describe-images', repositoryName=REPO_NAME,
                 imageIds=[{'imageTag': commit}]).get('imageDetails', [])
    if len(images) != 1:
        raise DeploymentError('Expected one image for this commit')
    image = image_uri(REPOSITORY + '@' + images[0]['imageDigest'])
    configured = parameters(aws)
    before = snapshot(aws)
    response = aws('ecs', 'describe-task-definition', taskDefinition=before['taskDefinition'], include=['TAGS'])
    payload = registration(response, image, configured)
    revision = task_arn(aws('ecs', 'register-task-definition', **payload)['taskDefinition']['taskDefinitionArn'])
    latest = snapshot(aws)
    if any(latest[k] != before[k] for k in ('taskDefinition', 'desiredCount')):
        raise DeploymentError('Service changed concurrently; no service update was sent')
    aws('ecs', 'update-service', cluster=CLUSTER, service=SERVICE, taskDefinition=revision)
    aws.wait()
    after = snapshot(aws)
    if after['taskDefinition'] != revision or after['desiredCount'] != before['desiredCount']:
        raise DeploymentError('Service did not retain the requested revision/count; check rollback events')
    if before['desiredCount'] == 0 and (after.get('runningCount', 0) or after.get('pendingCount', 0)):
        raise DeploymentError('Unexpected tasks on a zero-count service')
    return {'image': image, 'task_definition': revision, 'desired_count': after['desiredCount']}


def ensure_role(aws, name, execution=False, kms_key=None):
    trust = {'Version': '2012-10-17', 'Statement': [{
        'Effect': 'Allow', 'Principal': {'Service': 'ecs-tasks.amazonaws.com'},
        'Action': 'sts:AssumeRole', 'Condition': {
            'StringEquals': {'aws:SourceAccount': ACCOUNT},
            'ArnLike': {'aws:SourceArn': f'arn:aws:ecs:{REGION}:{ACCOUNT}:*'},
        },
    }]}
    roles = aws('iam', 'list-roles', PathPrefix='/notdrive/').get('Roles', [])
    existing = [role for role in roles if role['RoleName'] == name]
    if existing:
        role = existing[0]
        if role['AssumeRolePolicyDocument'] != trust:
            raise DeploymentError(f'Unexpected trust policy on {name}')
    else:
        role = aws('iam', 'create-role', RoleName=name, Path='/notdrive/', AssumeRolePolicyDocument=json.dumps(trust))['Role']
    if execution:
        statements = [
            {'Effect': 'Allow', 'Action': 'ecr:GetAuthorizationToken', 'Resource': '*'},
            {'Effect': 'Allow', 'Action': ['ecr:BatchCheckLayerAvailability', 'ecr:GetDownloadUrlForLayer', 'ecr:BatchGetImage'],
             'Resource': f'arn:aws:ecr:{REGION}:{ACCOUNT}:repository/{REPO_NAME}'},
            {'Effect': 'Allow', 'Action': ['logs:CreateLogStream', 'logs:PutLogEvents'],
             'Resource': f'arn:aws:logs:{REGION}:{ACCOUNT}:log-group:{LOG_GROUP}:*'},
            {'Effect': 'Allow', 'Action': 'ssm:GetParameters',
             'Resource': [parameter_arn(key) for key in sorted(REQUIRED | OPTIONAL)]},
        ]
        if kms_key:
            statements.append({'Effect': 'Allow', 'Action': 'kms:Decrypt', 'Resource': kms_key,
                               'Condition': {'StringEquals': {'kms:ViaService': f'ssm.{REGION}.amazonaws.com'},
                                             'StringLike': {'kms:EncryptionContext:PARAMETER_ARN': [parameter_arn(k) for k in sorted(REQUIRED | OPTIONAL)]}}})
        aws('iam', 'put-role-policy', RoleName=name, PolicyName='NotdriveExecution',
            PolicyDocument=json.dumps({'Version': '2012-10-17', 'Statement': statements}))
    return role['Arn']


def bootstrap(aws, args):
    identity(aws)
    image = image_uri(args.image_uri)
    images = aws('ecr', 'describe-images', repositoryName=REPO_NAME,
                 imageIds=[{'imageDigest': image.split('@', 1)[1]}]).get('imageDetails', [])
    if len(images) != 1 or images[0].get('imageDigest') != image.split('@', 1)[1]:
        raise DeploymentError('Bootstrap image digest is not present in api-notdrive')
    configured = parameters(aws)
    services = aws('ecs', 'describe-services', cluster=CLUSTER, services=[SERVICE])
    if services.get('services'):
        raise DeploymentError('Service already exists; use deploy for releases')
    cluster = aws('ecs', 'describe-clusters', clusters=[CLUSTER])
    if len(cluster.get('clusters', [])) != 1 or cluster['clusters'][0]['status'] != 'ACTIVE':
        raise DeploymentError('Existing ECS cluster is not active')
    listener = aws('elbv2', 'describe-listeners', ListenerArns=[args.listener_arn])['Listeners'][0]
    if listener['Protocol'] != 'HTTPS':
        raise DeploymentError('Select an existing HTTPS listener with a certificate covering the API host')
    lb = aws('elbv2', 'describe-load-balancers', LoadBalancerArns=[listener['LoadBalancerArn']])['LoadBalancers'][0]
    if lb['Type'] != 'application':
        raise DeploymentError('Expected an application load balancer')
    if not re.fullmatch(r'[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?', args.api_domain) or '.' not in args.api_domain:
        raise DeploymentError('API domain must be a lowercase hostname without a scheme or path')
    if not 1 <= args.database_port <= 65535:
        raise DeploymentError('Database port must be between 1 and 65535')
    vpc = lb['VpcId']
    subnets = aws('ec2', 'describe-subnets', SubnetIds=args.subnets)['Subnets']
    if len(args.subnets) < 2 or len(subnets) != len(set(args.subnets)) or any(s['VpcId'] != vpc for s in subnets):
        raise DeploymentError('Task subnets must belong to the ALB VPC')
    db_group = aws('ec2', 'describe-security-groups', GroupIds=[args.database_security_group])['SecurityGroups'][0]
    if db_group['VpcId'] != vpc:
        raise DeploymentError('Database security group must belong to the task VPC')
    rules = aws('elbv2', 'describe-rules', ListenerArn=args.listener_arn)['Rules']
    if any(r['Priority'] == str(args.listener_priority) for r in rules):
        raise DeploymentError('Listener rule priority already in use')
    if any(args.api_domain in condition.get('Values', []) for r in rules for condition in r.get('Conditions', []) if condition['Field'] == 'host-header'):
        raise DeploymentError('API host already has a listener rule; review it before bootstrap')
    certificates = aws('elbv2', 'describe-listener-certificates', ListenerArn=args.listener_arn)['Certificates']
    covered = False
    for certificate in certificates:
        detail = aws('acm', 'describe-certificate', CertificateArn=certificate['CertificateArn'])['Certificate']
        if detail['Status'] != 'ISSUED':
            continue
        for domain in detail.get('SubjectAlternativeNames', []):
            if domain == args.api_domain or (domain.startswith('*.') and args.api_domain.split('.', 1)[-1] == domain[2:]):
                covered = True
    if not covered:
        raise DeploymentError('Attach an issued ACM certificate covering the API domain to the HTTPS listener first')

    groups = aws('ec2', 'describe-security-groups', Filters=[
        {'Name': 'group-name', 'Values': ['notdrive-task-sg']}, {'Name': 'vpc-id', 'Values': [vpc]},
    ])['SecurityGroups']
    if groups:
        raise DeploymentError('notdrive-task-sg already exists; inspect partial bootstrap resources before retrying')

    # Mutations below are only performed by an explicit bootstrap invocation.
    logs = aws('logs', 'describe-log-groups', logGroupNamePrefix=LOG_GROUP).get('logGroups', [])
    if not any(g['logGroupName'] == LOG_GROUP for g in logs):
        aws('logs', 'create-log-group', logGroupName=LOG_GROUP, tags={'Service': 'notdrive'})
    aws('logs', 'put-retention-policy', logGroupName=LOG_GROUP, retentionInDays=30)
    execution = ensure_role(aws, 'notdrive-ecs-execution', execution=True, kms_key=args.parameter_kms_key_arn)
    task_role = ensure_role(aws, 'notdrive-ecs-task')
    sg = aws('ec2', 'create-security-group', GroupName='notdrive-task-sg', Description='Notdrive private Fargate tasks',
             VpcId=vpc, TagSpecifications=[{'ResourceType': 'security-group', 'Tags': [{'Key': 'Service', 'Value': 'notdrive'}]}])['GroupId']
    aws('ec2', 'revoke-security-group-egress', GroupId=sg, IpPermissions=[{
        'IpProtocol': '-1', 'IpRanges': [{'CidrIp': '0.0.0.0/0'}],
    }])
    aws('ec2', 'authorize-security-group-egress', GroupId=sg, IpPermissions=[
        {'IpProtocol': 'tcp', 'FromPort': 443, 'ToPort': 443, 'IpRanges': [{'CidrIp': '0.0.0.0/0'}]},
        {'IpProtocol': 'tcp', 'FromPort': args.database_port, 'ToPort': args.database_port,
         'UserIdGroupPairs': [{'GroupId': args.database_security_group}]},
    ])
    aws('ec2', 'authorize-security-group-ingress', GroupId=sg, IpPermissions=[{
        'IpProtocol': 'tcp', 'FromPort': 3000, 'ToPort': 3000,
        'UserIdGroupPairs': [{'GroupId': group} for group in lb['SecurityGroups']],
    }])
    aws('ec2', 'authorize-security-group-ingress', GroupId=args.database_security_group, IpPermissions=[{
        'IpProtocol': 'tcp', 'FromPort': args.database_port, 'ToPort': args.database_port,
        'UserIdGroupPairs': [{'GroupId': sg, 'Description': 'Notdrive ECS only'}],
    }])
    target = aws('elbv2', 'create-target-group', Name='notdrive-api-prod', Protocol='HTTP', Port=3000,
                 VpcId=vpc, TargetType='ip', HealthCheckPath='/health', Matcher={'HttpCode': '200'})['TargetGroups'][0]['TargetGroupArn']
    aws('elbv2', 'modify-target-group-attributes', TargetGroupArn=target,
        Attributes=[{'Key': 'deregistration_delay.timeout_seconds', 'Value': '30'}])
    rule = aws('elbv2', 'create-rule', ListenerArn=args.listener_arn, Priority=args.listener_priority,
               Conditions=[{'Field': 'host-header', 'Values': [args.api_domain]}],
               Actions=[{'Type': 'forward', 'TargetGroupArn': target}])['Rules'][0]['RuleArn']
    revision = task_arn(aws('ecs', 'register-task-definition', **definition(image, execution, task_role, configured))['taskDefinition']['taskDefinitionArn'])
    aws('ecs', 'create-service', cluster=CLUSTER, serviceName=SERVICE, taskDefinition=revision,
        desiredCount=0, launchType='FARGATE', platformVersion='1.4.0', enableECSManagedTags=True,
        propagateTags='TASK_DEFINITION', healthCheckGracePeriodSeconds=180,
        deploymentConfiguration={'minimumHealthyPercent': 0, 'maximumPercent': 100,
                                 'deploymentCircuitBreaker': {'enable': True, 'rollback': True}},
        networkConfiguration={'awsvpcConfiguration': {'subnets': args.subnets, 'securityGroups': [sg], 'assignPublicIp': 'DISABLED'}},
        loadBalancers=[{'targetGroupArn': target, 'containerName': 'notdrive-api', 'containerPort': 3000}], tags=TAGS)
    return {'service': SERVICE, 'task_definition': revision, 'desired_count': 0,
            'task_security_group': sg, 'target_group': target, 'listener_rule': rule,
            'execution_role': execution, 'task_role': task_role}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    release = commands.add_parser('deploy', help='Update an existing service without scaling it')
    release.add_argument('--image-tag', required=True)
    setup = commands.add_parser('bootstrap', help='Create a zero-task service using direct AWS APIs')
    setup.add_argument('--image-uri', required=True)
    setup.add_argument('--listener-arn', required=True)
    setup.add_argument('--listener-priority', required=True, type=int, choices=range(1, 50001), metavar='1..50000')
    setup.add_argument('--api-domain', required=True)
    setup.add_argument('--database-security-group', required=True)
    setup.add_argument('--database-port', type=int, default=5437)
    setup.add_argument('--subnets', nargs='+', required=True)
    setup.add_argument('--parameter-kms-key-arn')
    args = parser.parse_args()
    result = deploy(Aws(), args.image_tag) if args.command == 'deploy' else bootstrap(Aws(), args)
    summary = json.dumps(result, indent=2) + '\n'
    print(summary)
    if os.environ.get('GITHUB_STEP_SUMMARY'):
        with Path(os.environ['GITHUB_STEP_SUMMARY']).open('a') as output:
            output.write('```json\n' + summary + '```\n')


if __name__ == '__main__':
    try:
        main()
    except (DeploymentError, subprocess.CalledProcessError, subprocess.TimeoutExpired) as exc:
        # CLI stderr can contain API payloads; report only operation/exit status.
        print(str(exc) if isinstance(exc, DeploymentError) else 'AWS operation failed; inspect AWS service events and permissions.', file=sys.stderr)
        sys.exit(1)
