## Amazon ECS "Deploy Task Definition" Action for GitHub Actions

Registers an Amazon ECS task definition and deploys it to an ECS service.

**Table of Contents**

<!-- toc -->

- [Usage](#usage)
    + [Task definition file](#task-definition-file)
    + [Task definition container image values](#task-definition-container-image-values)
- [Credentials and Region](#credentials-and-region)
- [Permissions](#permissions)
- [AWS CodeDeploy Support](#aws-codedeploy-support)
- [Troubleshooting](#troubleshooting)
- [License Summary](#license-summary)
- [Security Disclosures](#security-disclosures)

<!-- tocstop -->

## Usage

```yaml
    - name: Deploy to Amazon ECS
      uses: aws-actions/amazon-ecs-deploy-task-definition@v2
      with:
        task-definition: task-definition.json
        service: my-service
        cluster: my-cluster
        wait-for-service-stability: true
```

See [action.yml](action.yml) for the full documentation for this action's inputs and outputs.
In most cases when running a one-off task, subnet ID's, subnet groups, and assign public IP will be required. 
Assign public IP will only be applied when a subnet or security group is defined. 

### Task definition file

It is highly recommended to treat the task definition "as code" by checking it into your git repository as a JSON file.  Changes to any task definition attributes like container images, environment variables, CPU, and memory can be deployed with this GitHub action by editing your task definition file and pushing a new git commit.

An existing task definition can be downloaded to a JSON file with the following command.  Account IDs can be removed from the file by removing the `taskDefinitionArn` attribute, and updating the `executionRoleArn` and `taskRoleArn` attribute values to contain role names instead of role ARNs.
```sh
aws ecs describe-task-definition \
   --task-definition my-task-definition-family \
   --query taskDefinition > task-definition.json
```

Alternatively, you can start a new task definition file from scratch with the following command.  In the generated file, fill in your attribute values and remove any attributes not needed for your application.
```sh
aws ecs register-task-definition \
   --generate-cli-skeleton > task-definition.json
```

If you do not wish to store your task definition as a file in your git repository, your GitHub Actions workflow can download the existing task definition.
```yaml
    - name: Download task definition
      run: |
        aws ecs describe-task-definition --task-definition my-task-definition-family --query taskDefinition > task-definition.json
```

### Task definition container image values

It is highly recommended that each time your GitHub Actions workflow runs and builds a new container image for deployment, a new container image ID is generated.  For example, use the commit ID as the new image's tag, instead of updating the 'latest' tag with the new image.  Using a unique container image ID for each deployment allows rolling back to a previous container image.

The task definition file can be updated prior to deployment with the new container image ID using [the `aws-actions/amazon-ecs-render-task-definition` action](https://github.com/aws-actions/amazon-ecs-render-task-definition).  The following example builds a new container image tagged with the commit ID, inserts the new image ID as the image for the `my-container` container in the task definition file, and then deploys the rendered task definition file to ECS:

```yaml
    - name: Configure AWS credentials
      uses: aws-actions/configure-aws-credentials@v1
      with:
        aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
        aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
        aws-region: us-east-2

    - name: Login to Amazon ECR
      id: login-ecr
      uses: aws-actions/amazon-ecr-login@v1

    - name: Build, tag, and push image to Amazon ECR
      id: build-image
      env:
        ECR_REGISTRY: ${{ steps.login-ecr.outputs.registry }}
        ECR_REPOSITORY: my-ecr-repo
        IMAGE_TAG: ${{ github.sha }}
      run: |
        docker build -t $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG .
        docker push $ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG
        echo "image=$ECR_REGISTRY/$ECR_REPOSITORY:$IMAGE_TAG" >> $GITHUB_OUTPUT

    - name: Fill in the new image ID in the Amazon ECS task definition
      id: task-def
      uses: aws-actions/amazon-ecs-render-task-definition@v1
      with:
        task-definition: task-definition.json
        container-name: my-container
        image: ${{ steps.build-image.outputs.image }}

    - name: Deploy Amazon ECS task definition
      uses: aws-actions/amazon-ecs-deploy-task-definition@v2
      with:
        task-definition: ${{ steps.task-def.outputs.task-definition }}
        service: my-service
        cluster: my-cluster
        wait-for-service-stability: true
```

### Tags

To turn on [Amazon ECS-managed tags](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/ecs-using-tags.html#managed-tags) `aws:ecs:serviceName` and `aws:ecs:clusterName` for the tasks in the service or the standalone tasks by setting `enable-ecs-managed-tags`:

```yaml
      - name: Deploy Amazon ECS task definition
        uses: aws-actions/amazon-ecs-deploy-task-definition@v2
        with:
          task-definition: task-definition.json
          service: my-service
          cluster: my-cluster
          wait-for-service-stability: true
          enable-ecs-managed-tags: true
```

You can propagate your custom tags from your existing service using `propagate-tags`:

```yaml
      - name: Deploy Amazon ECS task definition
        uses: aws-actions/amazon-ecs-deploy-task-definition@v2
        with:
          task-definition: task-definition.json
          service: my-service
          cluster: my-cluster
          wait-for-service-stability: true
          propagate-tags: SERVICE
```

### EBS Volume Configuration
This action supports configuring Amazon EBS volumes for both services and standalone tasks.

For Services (Update Service):

```yaml
    - name: Deploy to Amazon ECS with EBS Volume
      uses: aws-actions/amazon-ecs-deploy-task-definition@v2
      with:
        task-definition: task-definition.json
        service: my-service
        cluster: my-cluster
        wait-for-service-stability: true
        service-managed-ebs-volume-name: "ebs1"
        service-managed-ebs-volume: '{"sizeInGiB": 30, "volumeType": "gp3", "encrypted": true, "roleArn":"arn:aws:iam::<account-id>:role/ebs-role"}'
```

Note: Your task definition must include a volume that is configuredAtLaunch:

```json
    ...
    "volumes": [
        {
            "name": "ebs1",
            "configuredAtLaunch": true
        }
    ],
    ...
```

For Standalone Tasks (RunTask):

```yaml
    - name: Deploy to Amazon ECS
      uses: aws-actions/amazon-ecs-deploy-task-definition@v2
      with:
        task-definition: task-definition.json
        cluster: my-cluster
        run-task: true
        run-task-launch-type: EC2
        run-task-managed-ebs-volume-name: "ebs1"
        run-task-managed-ebs-volume: '{"filesystemType":"xfs", "roleArn":"arn:aws:iam::<account-id>:role/github-actions-setup-stack-EBSRole-YwVmgS4g7gQE", "encrypted":false, "sizeInGiB":30}'
```

## Credentials and Region

This action relies on the [default behavior of the AWS SDK for Javascript](https://docs.aws.amazon.com/sdk-for-javascript/v2/developer-guide/setting-credentials-node.html) to determine AWS credentials and region.
Use [the `aws-actions/configure-aws-credentials` action](https://github.com/aws-actions/configure-aws-credentials) to configure the GitHub Actions environment with environment variables containing AWS credentials and your desired region.

We recommend following [Amazon IAM best practices](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html) for the AWS credentials used in GitHub Actions workflows, including:
* Do not store credentials in your repository's code.  You may use [GitHub Actions secrets](https://help.github.com/en/actions/automating-your-workflow-with-github-actions/creating-and-using-encrypted-secrets) to store credentials and redact credentials from GitHub Actions workflow logs.
* [Create an individual IAM user](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#create-iam-users) with an access key for use in GitHub Actions workflows, preferably one per repository. Do not use the AWS account root user access key.
* [Grant least privilege](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#grant-least-privilege) to the credentials used in GitHub Actions workflows.  Grant only the permissions required to perform the actions in your GitHub Actions workflows.  See the Permissions section below for the permissions required by this action.
* [Rotate the credentials](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#rotate-credentials) used in GitHub Actions workflows regularly.
* [Monitor the activity](https://docs.aws.amazon.com/IAM/latest/UserGuide/best-practices.html#keep-a-log) of the credentials used in GitHub Actions workflows.

## Permissions

Running a service requires the following minimum set of permissions:
```json
{
   "Version":"2012-10-17",
   "Statement":[
      {
         "Sid":"RegisterTaskDefinition",
         "Effect":"Allow",
         "Action":[
            "ecs:RegisterTaskDefinition"
         ],
         "Resource":"*"
      },
      {
         "Sid":"PassRolesInTaskDefinition",
         "Effect":"Allow",
         "Action":[
            "iam:PassRole"
         ],
         "Resource":[
            "arn:aws:iam::<aws_account_id>:role/<task_definition_task_role_name>",
            "arn:aws:iam::<aws_account_id>:role/<task_definition_task_execution_role_name>"
         ]
      },
      {
         "Sid":"DeployService",
         "Effect":"Allow",
         "Action":[
            "ecs:UpdateService",
            "ecs:DescribeServices"
         ],
         "Resource":[
            "arn:aws:ecs:<region>:<aws_account_id>:service/<cluster_name>/<service_name>"
         ]
      }
   ]
}
```
 
Running a one-off/stand-alone task requires the following minimum set of permissions:
```json
{
   "Version": "2012-10-17",
   "Statement":[
      {
         "Sid": "VisualEditor0",
         "Effect": "Allow",
         "Action":[
            "ecs:RunTask",
            "ecs:RegisterTaskDefinition",
            "ecs:DescribeTasks"
         ],
         "Resource": "*"
      },
      {
         "Sid": "PassRolesInTaskDefinition",
         "Effect":"Allow",
         "Action":[
            "iam:PassRole"
         ],
         "Resource":[
            "arn:aws:iam::<aws_account_id>:role/<task_definition_task_role_name>",
            "arn:aws:iam::<aws_account_id>:role/<task_definition_task_execution_role_name>"
         ]
      }
   ]
}
```
Note: the policy above assumes the account has opted in to the ECS long ARN format.

## AWS CodeDeploy Support

For ECS services that uses the `CODE_DEPLOY` deployment controller, additional configuration is needed for this action:

```yaml
    - name: Deploy to Amazon ECS
      uses: aws-actions/amazon-ecs-deploy-task-definition@v2
      with:
        task-definition: task-definition.json
        service: my-service
        cluster: my-cluster
        wait-for-service-stability: true
        codedeploy-appspec: appspec.json
        codedeploy-application: my-codedeploy-application
        codedeploy-deployment-group: my-codedeploy-deployment-group
```

The minimal permissions require access to CodeDeploy:

```json
{
   "Version":"2012-10-17",
   "Statement":[
      {
         "Sid":"RegisterTaskDefinition",
         "Effect":"Allow",
         "Action":[
            "ecs:RegisterTaskDefinition"
         ],
         "Resource":"*"
      },
      {
         "Sid":"PassRolesInTaskDefinition",
         "Effect":"Allow",
         "Action":[
            "iam:PassRole"
         ],
         "Resource":[
            "arn:aws:iam::<aws_account_id>:role/<task_definition_task_role_name>",
            "arn:aws:iam::<aws_account_id>:role/<task_definition_task_execution_role_name>"
         ]
      },
      {
         "Sid":"DeployService",
         "Effect":"Allow",
         "Action":[
            "ecs:DescribeServices",
            "codedeploy:GetDeploymentGroup",
            "codedeploy:CreateDeployment",
            "codedeploy:GetDeployment",
            "codedeploy:GetDeploymentConfig",
            "codedeploy:RegisterApplicationRevision"
         ],
         "Resource":[
            "arn:aws:ecs:<region>:<aws_account_id>:service/<cluster_name>/<service_name>",
            "arn:aws:codedeploy:<region>:<aws_account_id>:deploymentgroup:<application_name>/<deployment_group_name>",
            "arn:aws:codedeploy:<region>:<aws_account_id>:deploymentconfig:*",
            "arn:aws:codedeploy:<region>:<aws_account_id>:application:<application_name>"
         ]
      }
   ]
}
```

## Running Tasks

For services which need an initialization task, such as database migrations, or ECS tasks that are run without a service, additional configuration can be added to trigger an ad-hoc task run. When combined with GitHub Action's `on: schedule` triggers, runs can also be scheduled without EventBridge.

In the following example, the service would not be updated until the ad-hoc task exits successfully.

```yaml
    - name: Deploy to Amazon ECS
      uses: aws-actions/amazon-ecs-deploy-task-definition@v2
      with:
        task-definition: task-definition.json
        service: my-service
        cluster: my-cluster
        wait-for-service-stability: true
        run-task: true
        wait-for-task-stopped: true
```

Overrides and VPC networking options are available as well. See [action.yml](action.yml) for more details. The `FARGATE` 
launch type requires `awsvpc` network mode in your task definition and you must specify a network configuration.

### Tags

To tag your tasks:

* to turn on Amazon ECS-managed tags (`aws:ecs:clusterName`), use `enable-ecs-managed-tags`
* for custom tags, use `run-task-tags`

```yaml
    - name: Deploy to Amazon ECS
      uses: aws-actions/amazon-ecs-deploy-task-definition@v2
      with:
        task-definition: task-definition.json
        service: my-service
        cluster: my-cluster
        wait-for-service-stability: true
        run-task: true
        enable-ecs-managed-tags: true
        run-task-tags: '[{"key": "project", "value": "myproject"}]'
        wait-for-task-stopped: true
```

## Troubleshooting

This action emits debug logs to help troubleshoot deployment failures.  To see the debug logs, create a secret named `ACTIONS_STEP_DEBUG` with value `true` in your repository.

## License Summary

This code is made available under the MIT license.

## Security Disclosures

If you would like to report a potential security issue in this project, please do not create a GitHub issue.  Instead, please follow the instructions [here](https://aws.amazon.com/security/vulnerability-reporting/) or [email AWS security directly](mailto:aws-security@amazon.com).

