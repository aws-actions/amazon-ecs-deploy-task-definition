const path = require('path');
const core = require('@actions/core');
const aws = require('aws-sdk');

async function run() {
  try {
    const ecs = new aws.ECS();

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
    const taskDefContents = require(taskDefPath);
    const registerResponse = await ecs.registerTaskDefinition(taskDefContents).promise();
    const taskDefArn = registerResponse.taskDefinition.taskDefinitionArn;
    core.setOutput('task-definition-arn', taskDefArn);

    // Update the service with the new task definition
    if (service) {
      core.debug('Updating the service');
      const clusterName = cluster ? cluster : 'default';
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
    } else {
      core.debug('Service was not specified, no service updated');
    }
  }
  catch (error) {
    core.setFailed(error.message);
  }
}

module.exports = run;

/* istanbul ignore next */
if (require.main === module) {
    run();
}
