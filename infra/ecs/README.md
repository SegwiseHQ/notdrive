# Notdrive on ECS

Deploy with `scripts/ecs.py`, which calls AWS APIs through the AWS CLI. The setup
and release flow use no CloudFormation, Docker Compose, or env-file reads.

## Destination

- Account `302693472565`, region `ap-south-1`, existing cluster `dashboard-server`.
- Existing ECR repository `api-notdrive`; images must be Linux ARM64 and pinned by digest.
- New service `notdrive-api-service`, task family `notdrive-api`, 0.5 vCPU / 1 GiB.
- Existing private subnets with NAT, PostgreSQL, and an existing HTTPS ALB/listener.
- A dedicated task security group, execution/task roles, `/ecs/notdrive/api` logs
  with 30-day retention, an IP target group, and one host-specific listener rule.

The bootstrap adds port-3000 ingress only from the selected ALB security groups,
HTTPS outbound for Google/AWS APIs, PostgreSQL egress on the selected port, and one
database ingress rule from the new task group. Tasks receive no public IPs. The
execution role can pull only `api-notdrive`, write its logs, and inject the exact
supported SSM parameters. The application task role has no AWS API permissions.

The service runs at most one task: deployments stop the old task before starting
the new one (`minimumHealthyPercent=0`, `maximumPercent=100`). This prevents
concurrent startup migrations but introduces a brief outage during deployments.
The API's existing job runner stays inside the API process; no separate worker,
Redis, or scheduler service is needed. API startup waits up to 120 seconds for a
successful nonessential migration container; failures prevent startup. Both
containers use the same image, run as the image's nonroot user, have read-only
filesystems, and skip the entrypoint's automatic migrations.

## Runtime configuration

Create SSM parameters in `ap-south-1` through your secure operator workflow. Copy
existing values without changing the database, encryption key or session secret.
Neither setup nor CI retrieves parameter values; they enumerate metadata only.

| Name under `/segwise/notdrive/runtime/` | Type | Value |
| --- | --- | --- |
| `DATABASE_URL` | SecureString | Existing Notdrive PostgreSQL database/user connection URL |
| `GOOGLE_CLIENT_ID` | String or SecureString | Existing OAuth client ID |
| `GOOGLE_CLIENT_SECRET` | SecureString | Existing OAuth client secret |
| `GOOGLE_OAUTH_REDIRECT_URI` | String | Existing HTTPS API callback, ending `/api/auth/google/callback` |
| `APP_ENCRYPTION_KEY` | SecureString | Existing base64 32-byte key; preserve to decrypt Drive tokens |
| `SESSION_SECRET` | SecureString | Existing session key |
| `API_ORIGIN` | String | Existing public API origin |
| `WEB_ORIGIN` | String | Allowed frontend origin(s), comma separated |

Optional supported parameters: `ALLOWED_EMAIL_DOMAINS`, `DRIVE_TREE_DEPTH`,
`LOG_LEVEL`, `DATABASE_SSL`, and `DATABASE_SSL_CA`. Defaults are the application
values except database TLS: ECS defaults to `DATABASE_SSL=require` and
`DATABASE_SSL_CA=/etc/ssl/rds-global-bundle.pem`. The image bundles AWS's public
RDS CA bundle. A `DATABASE_SSL_CA` override must point to a certificate available
inside the image. Password-bearing URL query settings must agree with the TLS
configuration. No plaintext secret values belong in source, task-definition
`environment` entries, workflow variables, command output, or PRs.

Use SSM's default encryption key, or pass `--parameter-kms-key-arn` at bootstrap
for a dedicated customer-managed key. The execution-role grant is scoped to SSM
and the supported parameter encryption contexts. Changing a parameter takes effect
on newly started tasks; restart the deployment to reload it.

## One-time bootstrap

First build/push the **new secret-free image**; do not use an old image containing
`.env`. Use a full commit SHA as the image tag. For example:

```bash
export AWS_REGION=ap-south-1
registry=302693472565.dkr.ecr.ap-south-1.amazonaws.com
aws ecr get-login-password | docker login --username AWS --password-stdin "$registry"
release_sha=$(git rev-parse HEAD)
docker build --platform linux/arm64 -t "$registry/api-notdrive:$release_sha" .
docker push "$registry/api-notdrive:$release_sha"
digest=$(aws ecr describe-images --repository-name api-notdrive --image-ids "imageTag=$release_sha" --query 'imageDetails[0].imageDigest' --output text)
```

Choose the existing API hostname, an unused HTTPS listener priority, the existing
Notdrive database's security group and actual port, and private subnets in the
same VPC as that ALB and database. The HTTPS listener must already have an issued
ACM certificate covering the hostname; bootstrap checks this before making changes.
Private subnets must route outbound HTTPS through NAT or suitable endpoints;
Google Drive/OAuth still require internet egress. Verify the ALB permits outbound
traffic to task port 3000 and the DB is reachable from these subnets.

Read-only inventory confirmed on 2026-10-30: Loop/Billgates use private subnets
`subnet-03e1587330c4a9609` and `subnet-0628ff2c7b53a7789` in VPC
`vpc-0b4f343f736624a75`. Confirm they are appropriate for this deployment.
The existing `api-notdrive` repository has images, but there was no Notdrive task
family, service, or SSM configuration under the prefix above. No resources have
been provisioned by this change.

```bash
python3 scripts/ecs.py bootstrap \
  --image-uri "$registry/api-notdrive@$digest" \
  --listener-arn YOUR_EXISTING_HTTPS_LISTENER_ARN \
  --listener-priority YOUR_UNUSED_PRIORITY \
  --api-domain YOUR_EXISTING_API_HOSTNAME \
  --database-security-group YOUR_EXISTING_DATABASE_SECURITY_GROUP \
  --database-port 5437 \
  --subnets subnet-03e1587330c4a9609 subnet-0628ff2c7b53a7789
```

Bootstrap creates the service with **desired count zero**. It never starts tasks,
runs migrations, changes DNS, creates a database, or creates an ALB/NAT/cluster.
IAM creation and scoped role-policy permissions are required for the one-time
setup, plus the documented EC2/ALB/log/ECS creation permissions and `iam:PassRole`.
The script refuses an existing service and conflicting host/priority rules.
If a bootstrap fails partway, inspect the Notdrive-specific resources before
retrying; it does not automatically delete resources or undo shared SG rules.

After reviewing configuration and migration compatibility with the current
release, activate explicitly:

```bash
aws ecs update-service --region ap-south-1 --cluster dashboard-server \
  --service notdrive-api-service --desired-count 1
aws ecs wait services-stable --region ap-south-1 --cluster dashboard-server \
  --services notdrive-api-service
```

Check the new task's migration exit code, API health, target health and logs. Test
TLS/CORS/OAuth against the ALB before moving DNS (for example `curl --connect-to`
with the API hostname and ALB DNS name). Move the existing API DNS record only
after verification, then retire the previous backend. Keep frontend API origin,
Google callback and current secrets consistent. Do not run both backends against
production during cutover without reviewing background-job overlap. The frontend
stays on Amplify.

## Releases and configuration updates

The existing CI workflow runs application checks, deployment regression tests,
and an ARM64 image build on PRs. After checks pass on `main` (or a manual run on
`main`), GitHub Actions pushes the commit-tagged image, resolves its digest, clones
the live task definition, updates both container images and supported SSM references,
registers a new revision, and updates the existing service. It waits for stability
and verifies the service retained that revision rather than rolling back. Service
desired count is preserved: a zero-task service stays at zero. Release jobs are
serialized and not cancelled midway. CI does not bootstrap infrastructure.

After bootstrap, configure repository Actions secrets `AWS_ACCESS_KEY_ID` and
`AWS_SECRET_ACCESS_KEY`, like Loop/Billgates, then set the repository Actions
variable `ECS_DEPLOY_ENABLED=true`. Image publishing/service updates are skipped
until that variable is enabled; PR checks always run. The deployment principal needs ECR
push/read for `api-notdrive`, ECS describe/register/tag/update and service wait
permissions for Notdrive, metadata-only `ssm:DescribeParameters`, and `iam:PassRole`
for the two `/notdrive/` roles. It does not need SSM value retrieval, IAM writes,
EC2/ALB provisioning, `ecs:RunTask`, or CloudFormation access for routine releases.

To release an already-pushed commit manually:

```bash
python3 scripts/ecs.py deploy --image-tag FULL_COMMIT_SHA
```

To reload changed SSM values without changing the image:

```bash
aws ecs update-service --region ap-south-1 --cluster dashboard-server \
  --service notdrive-api-service --force-new-deployment
```

Rollback application code by updating the service to a known compatible previous
task revision. Migrations are not automatically reversed, so confirm compatibility
before rollback. Keep previous images/task revisions and database backups.

## Local verification

```bash
python3 -m unittest discover -s tests/deployment -v
python3 scripts/ecs.py --help
```

AWS references: [SSM injection](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/secrets-envvar-ssm-paramstore.html),
[container dependencies](https://docs.aws.amazon.com/AmazonECS/latest/APIReference/API_ContainerDependency.html),
and [ECS container health checks](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/healthcheck.html).
