const path = require('path');
const core = require('@actions/core');
const aws = require('aws-sdk');
const yaml = require('yaml');
const fs = require('fs');
const crypto = require('crypto');

const CODE_DEPLOY_WAIT_BUFFER_MINUTES = 10;
const CODE_DEPLOY_MAX_WAIT_MINUTES = 360;  // 6 hours
const CODE_DEPLOY_MIN_WAIT_MINUTES = 30;
const CODE_DEPLOY_WAIT_DEFAULT_DELAY_SEC = 15;

// Deploy to a service that uses the 'ECS' deployment controller
async function updateEcsService(ecs, clusterName, service, taskDefArn, waitForService) {
  core.debug('Updating the service');
  await ecs.updateService({
    cluster: clusterName,
    service: service,
    taskDefinition: taskDefArn
  }).promise();

  // Wait for service stability
  if (waitForService && waitForService.toLowerCase() === 'true') {
    core.debug('Waiting for the service to become stable');
    await ecs.waitFor('servicesStable', {
      services: [service],
      cluster: clusterName
    }).promise();
  } else {
    core.debug('Not waiting for the service to become stable');
  }
}

// Find value in a CodeDeploy AppSpec file with a case-insensitive key
function findAppSpecValue(obj, keyName) {
  return obj[findAppSpecKey(obj, keyName)];
}

function findAppSpecKey(obj, keyName) {
  if (!obj) {
    throw new Error(`AppSpec file must include property '${keyName}'`);
  }

  const keyToMatch = keyName.toLowerCase();

  for (var key in obj) {
    if (key.toLowerCase() == keyToMatch) {
      return key;
    }
  }

  throw new Error(`AppSpec file must include property '${keyName}'`);
}

// Deploy to a service that uses the 'CODE_DEPLOY' deployment controller
async function createCodeDeployDeployment(codedeploy, clusterName, service, taskDefArn, waitForService) {
  core.debug('Updating AppSpec file with new task definition ARN');

  let codeDeployAppSpecFile = core.getInput('codedeploy-appspec', { required : false });
  codeDeployAppSpecFile = codeDeployAppSpecFile ? codeDeployAppSpecFile : 'appspec.yaml';

  let codeDeployApp = core.getInput('codedeploy-application', { required: false });
  codeDeployApp = codeDeployApp ? codeDeployApp : `AppECS-${clusterName}-${service}`;

  let codeDeployGroup = core.getInput('codedeploy-deployment-group', { required: false });
  codeDeployGroup = codeDeployGroup ? codeDeployGroup : `DgpECS-${clusterName}-${service}`;

  let deploymentGroupDetails = await codedeploy.getDeploymentGroup({
    applicationName: codeDeployApp,
    deploymentGroupName: codeDeployGroup
  }).promise();
  deploymentGroupDetails = deploymentGroupDetails.deploymentGroupInfo;

  // Insert the task def ARN into the appspec file
  const appSpecPath = path.isAbsolute(codeDeployAppSpecFile) ?
    codeDeployAppSpecFile :
    path.join(process.env.GITHUB_WORKSPACE, codeDeployAppSpecFile);
  const fileContents = fs.readFileSync(appSpecPath, 'utf8');
  const appSpecContents = yaml.parse(fileContents);

  for (var resource of findAppSpecValue(appSpecContents, 'resources')) {
    for (var name in resource) {
      const resourceContents = resource[name];
      const properties = findAppSpecValue(resourceContents, 'properties');
      const taskDefKey = findAppSpecKey(properties, 'taskDefinition');
      properties[taskDefKey] = taskDefArn;
    }
  }

  const appSpecString = JSON.stringify(appSpecContents);
  const appSpecHash = crypto.createHash('sha256').update(appSpecString).digest('hex');

  // Start the deployment with the updated appspec contents
  core.debug('Starting CodeDeploy deployment');
  const createDeployResponse = await codedeploy.createDeployment({
    applicationName: codeDeployApp,
    deploymentGroupName: codeDeployGroup,
    revision: {
      revisionType: 'AppSpecContent',
      appSpecContent: {
        content: appSpecString,
        sha256: appSpecHash
      }
    }
  }).promise();
  core.setOutput('codedeploy-deployment-id', createDeployResponse.deploymentId);

  // Wait for deployment to complete
  if (waitForService && waitForService.toLowerCase() === 'true') {
    // Determine wait time
    const deployReadyWaitMin = deploymentGroupDetails.blueGreenDeploymentConfiguration.deploymentReadyOption.waitTimeInMinutes;
    const terminationWaitMin = deploymentGroupDetails.blueGreenDeploymentConfiguration.terminateBlueInstancesOnDeploymentSuccess.terminationWaitTimeInMinutes;
    let totalWaitMin = deployReadyWaitMin + terminationWaitMin + CODE_DEPLOY_WAIT_BUFFER_MINUTES;
    if (totalWaitMin > CODE_DEPLOY_MAX_WAIT_MINUTES) {
      totalWaitMin = CODE_DEPLOY_MAX_WAIT_MINUTES;
    }
    if (totalWaitMin < CODE_DEPLOY_MIN_WAIT_MINUTES) {
      totalWaitMin = CODE_DEPLOY_MIN_WAIT_MINUTES;
    }
    const maxAttempts = (totalWaitMin * 60) / CODE_DEPLOY_WAIT_DEFAULT_DELAY_SEC;

    core.debug(`Waiting for the deployment to complete. Will wait for ${totalWaitMin} minutes`);
    await codedeploy.waitFor('deploymentSuccessful', {
      deploymentId: createDeployResponse.deploymentId,
      $waiter: {
        delay: CODE_DEPLOY_WAIT_DEFAULT_DELAY_SEC,
        maxAttempts: maxAttempts
      }
    }).promise();
  } else {
    core.debug('Not waiting for the deployment to complete');
  }
}

async function run() {
  try {
    const ecs = new aws.ECS({
      customUserAgent: 'amazon-ecs-deploy-task-definition-for-github-actions'
    });
    const codedeploy = new aws.CodeDeploy({
      customUserAgent: 'amazon-ecs-deploy-task-definition-for-github-actions'
    });

    // Get inputs
    const taskDefinitionFile = core.getInput('task-definition', { required: true });
    const service = core.getInput('service', { required: false });
    const cluster = core.getInput('cluster', { required: false });
    const waitForService = core.getInput('wait-for-service-stability', { required: false });

    // Register the task definition
    core.debug('Registering the task definition');
    const taskDefPath = path.isAbsolute(taskDefinitionFile) ?
      taskDefinitionFile :
      path.join(process.env.GITHUB_WORKSPACE, taskDefinitionFile);
    const fileContents = fs.readFileSync(taskDefPath, 'utf8');
    const taskDefContents = yaml.parse(fileContents);
    const registerResponse = await ecs.registerTaskDefinition(taskDefContents).promise();
    const taskDefArn = registerResponse.taskDefinition.taskDefinitionArn;
    core.setOutput('task-definition-arn', taskDefArn);

    // Update the service with the new task definition
    if (service) {
      const clusterName = cluster ? cluster : 'default';

      // Determine the deployment controller
      const describeResponse = await ecs.describeServices({
        services: [service],
        cluster: clusterName
      }).promise();

      if (describeResponse.failures && describeResponse.failures.length > 0) {
        const failure = describeResponse.failures[0];
        throw new Error(`${failure.arn} is ${failure.reason}`);
      }

      const serviceResponse = describeResponse.services[0];
      if (serviceResponse.status != 'ACTIVE') {
        throw new Error(`Service is ${serviceResponse.status}`);
      }

      if (!serviceResponse.deploymentController) {
        // Service uses the 'ECS' deployment controller, so we can call UpdateService
        await updateEcsService(ecs, clusterName, service, taskDefArn, waitForService);
      } else if (serviceResponse.deploymentController.type == 'CODE_DEPLOY') {
        // Service uses CodeDeploy, so we should start a CodeDeploy deployment
        await createCodeDeployDeployment(codedeploy, clusterName, service, taskDefArn, waitForService);
      } else {
        throw new Error(`Unsupported deployment controller: ${serviceResponse.deploymentController.type}`);
      }
    } else {
      core.debug('Service was not specified, no service updated');
    }
  }
  catch (error) {
    core.debug(error);
    core.debug(error.stack);
    core.setFailed(error.message);
  }
}

module.exports = run;

/* istanbul ignore next */
if (require.main === module) {
    run();
}
