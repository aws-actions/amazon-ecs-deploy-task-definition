const run = require('.');
const core = require('@actions/core');
const fs = require('fs');
const path = require('path');

jest.mock('@actions/core');
jest.mock('fs');

const mockEcsRegisterTaskDef = jest.fn();
const mockEcsUpdateService = jest.fn();
const mockEcsDescribeServices = jest.fn();
const mockEcsWaiter = jest.fn();
const mockCodeDeployCreateDeployment = jest.fn();
const mockCodeDeployGetDeploymentGroup = jest.fn();
const mockCodeDeployWaiter = jest.fn();
jest.mock('aws-sdk', () => {
    return {
        ECS: jest.fn(() => ({
            registerTaskDefinition: mockEcsRegisterTaskDef,
            updateService: mockEcsUpdateService,
            describeServices: mockEcsDescribeServices,
            waitFor: mockEcsWaiter
        })),
        CodeDeploy: jest.fn(() => ({
            createDeployment: mockCodeDeployCreateDeployment,
            getDeploymentGroup: mockCodeDeployGetDeploymentGroup,
            waitFor: mockCodeDeployWaiter
        }))
    };
});

describe('Deploy to ECS', () => {

    beforeEach(() => {
        jest.clearAllMocks();

        core.getInput = jest
            .fn()
            .mockReturnValueOnce('task-definition.json') // task-definition
            .mockReturnValueOnce('service-456')         // service
            .mockReturnValueOnce('cluster-789');        // cluster

        process.env = Object.assign(process.env, { GITHUB_WORKSPACE: __dirname });

        fs.readFileSync.mockImplementation((pathInput, encoding) => {
            if (encoding != 'utf8') {
                throw new Error(`Wrong encoding ${encoding}`);
            }

            if (pathInput == path.join(process.env.GITHUB_WORKSPACE, 'appspec.yaml')) {
                return `
                Resources:
                - TargetService:
                    Type: AWS::ECS::Service
                    Properties:
                      TaskDefinition: helloworld
                      LoadBalancerInfo:
                        ContainerName: web
                        ContainerPort: 80`;
            }

            if (pathInput == path.join(process.env.GITHUB_WORKSPACE, 'task-definition.json')) {
                return JSON.stringify({ family: 'task-def-family' });
            }

            throw new Error(`Unknown path ${pathInput}`);
        });

        mockEcsRegisterTaskDef.mockImplementation(() => {
            return {
                promise() {
                    return Promise.resolve({ taskDefinition: { taskDefinitionArn: 'task:def:arn' } });
                }
            };
        });

        mockEcsUpdateService.mockImplementation(() => {
            return {
                promise() {
                    return Promise.resolve({});
                }
            };
        });

        mockEcsDescribeServices.mockImplementation(() => {
            return {
                promise() {
                    return Promise.resolve({
                        failures: [],
                        services: [{
                            status: 'ACTIVE'
                        }]
                    });
                }
            };
        });

        mockEcsWaiter.mockImplementation(() => {
            return {
                promise() {
                    return Promise.resolve({});
                }
            };
        });

        mockCodeDeployCreateDeployment.mockImplementation(() => {
            return {
                promise() {
                    return Promise.resolve({ deploymentId: 'deployment-1' });
                }
            };
        });

        mockCodeDeployGetDeploymentGroup.mockImplementation(() => {
            return {
                promise() {
                    return Promise.resolve({
                        deploymentGroupInfo: {
                            blueGreenDeploymentConfiguration: {
                                deploymentReadyOption: {
                                    waitTimeInMinutes: 60
                                },
                                terminateBlueInstancesOnDeploymentSuccess: {
                                    terminationWaitTimeInMinutes: 30
                                }
                            }
                        }
                    });
                }
            };
        });

        mockCodeDeployWaiter.mockImplementation(() => {
            return {
                promise() {
                    return Promise.resolve({});
                }
            };
        });
    });

    test('registers the task definition contents and updates the service', async () => {
        await run();
        expect(core.setFailed).toHaveBeenCalledTimes(0);
        expect(mockEcsRegisterTaskDef).toHaveBeenNthCalledWith(1, { family: 'task-def-family'});
        expect(core.setOutput).toHaveBeenNthCalledWith(1, 'task-definition-arn', 'task:def:arn');
        expect(mockEcsDescribeServices).toHaveBeenNthCalledWith(1, {
            cluster: 'cluster-789',
            services: ['service-456']
        });
        expect(mockEcsUpdateService).toHaveBeenNthCalledWith(1, {
            cluster: 'cluster-789',
            service: 'service-456',
            taskDefinition: 'task:def:arn'
        });
        expect(mockEcsWaiter).toHaveBeenCalledTimes(0);
    });

    test('registers the task definition contents and creates a CodeDeploy deployment', async () => {
        core.getInput = jest
            .fn()
            .mockReturnValueOnce('task-definition.json') // task-definition
            .mockReturnValueOnce('service-456')         // service
            .mockReturnValueOnce('cluster-789')         // cluster
            .mockReturnValueOnce('TRUE');               // wait-for-service-stability

        mockEcsDescribeServices.mockImplementation(() => {
            return {
                promise() {
                    return Promise.resolve({
                        failures: [],
                        services: [{
                            status: 'ACTIVE',
                            deploymentController: {
                                type: 'CODE_DEPLOY'
                            }
                        }]
                    });
                }
            };
        });

        await run();
        expect(core.setFailed).toHaveBeenCalledTimes(0);

        expect(mockEcsRegisterTaskDef).toHaveBeenNthCalledWith(1, { family: 'task-def-family'});
        expect(core.setOutput).toHaveBeenNthCalledWith(1, 'task-definition-arn', 'task:def:arn');
        expect(mockEcsDescribeServices).toHaveBeenNthCalledWith(1, {
            cluster: 'cluster-789',
            services: ['service-456']
        });

        expect(mockCodeDeployCreateDeployment).toHaveBeenNthCalledWith(1, {
            applicationName: 'AppECS-cluster-789-service-456',
            deploymentGroupName: 'DgpECS-cluster-789-service-456',
            revision: {
                revisionType: 'AppSpecContent',
                appSpecContent: {
                  content: JSON.stringify({
                      Resources: [{
                          TargetService: {
                              Type: 'AWS::ECS::Service',
                              Properties: {
                                TaskDefinition: 'task:def:arn',
                                LoadBalancerInfo: {
                                    ContainerName: "web",
                                    ContainerPort: 80
                                }
                              }
                          }
                      }]
                    }),
                  sha256: '0911d1e99f48b492e238d1284d8ddb805382d33e1d1fc74ffadf37d8b7e6d096'
                }
            }
        });

        expect(mockCodeDeployWaiter).toHaveBeenNthCalledWith(1, 'deploymentSuccessful', {
            deploymentId: 'deployment-1',
            $waiter: {
                delay: 15,
                maxAttempts: 400
            }
        });

        expect(mockEcsUpdateService).toHaveBeenCalledTimes(0);
        expect(mockEcsWaiter).toHaveBeenCalledTimes(0);
    });

    test('does not wait for a CodeDeploy deployment, parses JSON appspec file', async () => {
        core.getInput = jest
            .fn()
            .mockReturnValueOnce('task-definition.json') // task-definition
            .mockReturnValueOnce('service-456')         // service
            .mockReturnValueOnce('cluster-789')         // cluster
            .mockReturnValueOnce('false')               // wait-for-service-stability
            .mockReturnValueOnce('/hello/appspec.json') // codedeploy-appspec
            .mockReturnValueOnce('MyApplication')       // codedeploy-application
            .mockReturnValueOnce('MyDeploymentGroup');  // codedeploy-deployment-group

        fs.readFileSync.mockReturnValue(`
            {
                "Resources": [
                    {
                        "TargetService": {
                            "Type": "AWS::ECS::Service",
                            "Properties": {
                                "TaskDefinition": "helloworld",
                                "LoadBalancerInfo": {
                                    "ContainerName": "web",
                                    "ContainerPort": 80
                                }
                            }
                        }
                    }
                ]
            }
        `);

        fs.readFileSync.mockImplementation((pathInput, encoding) => {
            if (encoding != 'utf8') {
                throw new Error(`Wrong encoding ${encoding}`);
            }

            if (pathInput == path.join('/hello/appspec.json')) {
                return `
                {
                    "Resources": [
                        {
                            "TargetService": {
                                "Type": "AWS::ECS::Service",
                                "Properties": {
                                    "TaskDefinition": "helloworld",
                                    "LoadBalancerInfo": {
                                        "ContainerName": "web",
                                        "ContainerPort": 80
                                    }
                                }
                            }
                        }
                    ]
                }`;
            }

            if (pathInput == path.join(process.env.GITHUB_WORKSPACE, 'task-definition.json')) {
                return JSON.stringify({ family: 'task-def-family' });
            }

            throw new Error(`Unknown path ${pathInput}`);
        });

        mockEcsDescribeServices.mockImplementation(() => {
            return {
                promise() {
                    return Promise.resolve({
                        failures: [],
                        services: [{
                            status: 'ACTIVE',
                            deploymentController: {
                                type: 'CODE_DEPLOY'
                            }
                        }]
                    });
                }
            };
        });

        await run();
        expect(core.setFailed).toHaveBeenCalledTimes(0);

        expect(mockEcsRegisterTaskDef).toHaveBeenNthCalledWith(1, { family: 'task-def-family'});
        expect(core.setOutput).toHaveBeenNthCalledWith(1, 'task-definition-arn', 'task:def:arn');
        expect(mockEcsDescribeServices).toHaveBeenNthCalledWith(1, {
            cluster: 'cluster-789',
            services: ['service-456']
        });

        expect(mockCodeDeployCreateDeployment).toHaveBeenNthCalledWith(1, {
            applicationName: 'MyApplication',
            deploymentGroupName: 'MyDeploymentGroup',
            revision: {
                revisionType: 'AppSpecContent',
                appSpecContent: {
                  content: JSON.stringify({
                      Resources: [{
                          TargetService: {
                              Type: 'AWS::ECS::Service',
                              Properties: {
                                TaskDefinition: 'task:def:arn',
                                LoadBalancerInfo: {
                                    ContainerName: "web",
                                    ContainerPort: 80
                                }
                              }
                          }
                      }]
                    }),
                  sha256: '0911d1e99f48b492e238d1284d8ddb805382d33e1d1fc74ffadf37d8b7e6d096'
                }
            }
        });

        expect(mockCodeDeployWaiter).toHaveBeenCalledTimes(0);
        expect(mockEcsUpdateService).toHaveBeenCalledTimes(0);
        expect(mockEcsWaiter).toHaveBeenCalledTimes(0);
    });

    test('registers the task definition contents at an absolute path', async () => {
        core.getInput = jest.fn().mockReturnValueOnce('/hello/task-definition.json');
        fs.readFileSync.mockImplementation((pathInput, encoding) => {
            if (encoding != 'utf8') {
                throw new Error(`Wrong encoding ${encoding}`);
            }

            if (pathInput == '/hello/task-definition.json') {
                return JSON.stringify({ family: 'task-def-family-absolute-path' });
            }

            throw new Error(`Unknown path ${pathInput}`);
        });

        await run();
        expect(core.setFailed).toHaveBeenCalledTimes(0);

        expect(mockEcsRegisterTaskDef).toHaveBeenNthCalledWith(1, { family: 'task-def-family-absolute-path'});
        expect(core.setOutput).toHaveBeenNthCalledWith(1, 'task-definition-arn', 'task:def:arn');
    });

   test('waits for the service to be stable', async () => {
        core.getInput = jest
            .fn()
            .mockReturnValueOnce('task-definition.json') // task-definition
            .mockReturnValueOnce('service-456')         // service
            .mockReturnValueOnce('cluster-789')         // cluster
            .mockReturnValueOnce('TRUE');               // wait-for-service-stability

        await run();
        expect(core.setFailed).toHaveBeenCalledTimes(0);

        expect(mockEcsRegisterTaskDef).toHaveBeenNthCalledWith(1, { family: 'task-def-family'});
        expect(core.setOutput).toHaveBeenNthCalledWith(1, 'task-definition-arn', 'task:def:arn');
        expect(mockEcsDescribeServices).toHaveBeenNthCalledWith(1, {
            cluster: 'cluster-789',
            services: ['service-456']
        });
        expect(mockEcsUpdateService).toHaveBeenNthCalledWith(1, {
            cluster: 'cluster-789',
            service: 'service-456',
            taskDefinition: 'task:def:arn'
        });
        expect(mockEcsWaiter).toHaveBeenNthCalledWith(1, 'servicesStable', {
            services: ['service-456'],
            cluster: 'cluster-789'
        });
    });

    test('defaults to the default cluster', async () => {
        core.getInput = jest
            .fn()
            .mockReturnValueOnce('task-definition.json') // task-definition
            .mockReturnValueOnce('service-456');         // service

        await run();
        expect(core.setFailed).toHaveBeenCalledTimes(0);

        expect(mockEcsRegisterTaskDef).toHaveBeenNthCalledWith(1, { family: 'task-def-family'});
        expect(core.setOutput).toHaveBeenNthCalledWith(1, 'task-definition-arn', 'task:def:arn');
        expect(mockEcsDescribeServices).toHaveBeenNthCalledWith(1, {
            cluster: 'default',
            services: ['service-456']
        });
        expect(mockEcsUpdateService).toHaveBeenNthCalledWith(1, {
            cluster: 'default',
            service: 'service-456',
            taskDefinition: 'task:def:arn'
        });
    });

    test('does not update service if none specified', async () => {
        core.getInput = jest
            .fn()
            .mockReturnValueOnce('task-definition.json'); // task-definition

        await run();
        expect(core.setFailed).toHaveBeenCalledTimes(0);

        expect(mockEcsRegisterTaskDef).toHaveBeenNthCalledWith(1, { family: 'task-def-family'});
        expect(core.setOutput).toHaveBeenNthCalledWith(1, 'task-definition-arn', 'task:def:arn');
        expect(mockEcsDescribeServices).toHaveBeenCalledTimes(0);
        expect(mockEcsUpdateService).toHaveBeenCalledTimes(0);
    });

    test('error caught if AppSpec file is not formatted correctly', async () => {
        mockEcsDescribeServices.mockImplementation(() => {
            return {
                promise() {
                    return Promise.resolve({
                        failures: [],
                        services: [{
                            status: 'ACTIVE',
                            deploymentController: {
                                type: 'CODE_DEPLOY'
                            }
                        }]
                    });
                }
            };
        });
        fs.readFileSync.mockReturnValue("hello: world");

        await run();

        expect(core.setFailed).toBeCalledWith("AppSpec file must include property 'resources'");
    });

    test('error is caught if service does not exist', async () => {
        mockEcsDescribeServices.mockImplementation(() => {
            return {
                promise() {
                    return Promise.resolve({
                        failures: [{
                            reason: 'MISSING',
                            arn: 'hello'
                        }],
                        services: []
                    });
                }
            };
        });

        await run();

        expect(core.setFailed).toBeCalledWith('hello is MISSING');
    });

    test('error is caught if service is inactive', async () => {
        mockEcsDescribeServices.mockImplementation(() => {
            return {
                promise() {
                    return Promise.resolve({
                        failures: [],
                        services: [{
                            status: 'INACTIVE'
                        }]
                    });
                }
            };
        });

        await run();

        expect(core.setFailed).toBeCalledWith('Service is INACTIVE');
    });

    test('error is caught if service uses external deployment controller', async () => {
        mockEcsDescribeServices.mockImplementation(() => {
            return {
                promise() {
                    return Promise.resolve({
                        failures: [],
                        services: [{
                            status: 'ACTIVE',
                            deploymentController: {
                                type: 'EXTERNAL'
                            }
                        }]
                    });
                }
            };
        });

        await run();

        expect(core.setFailed).toBeCalledWith('Unsupported deployment controller: EXTERNAL');
    });

    test('error is caught by core.setFailed', async () => {
        mockEcsRegisterTaskDef.mockImplementation(() => {
            throw new Error();
        });

        await run();

        expect(core.setFailed).toBeCalled();
    });
});
