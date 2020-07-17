# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [1.3.7](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/compare/v1.3.6...v1.3.7) (2020-07-17)

### [1.3.6](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/compare/v1.3.5...v1.3.6) (2020-07-14)

### [1.3.5](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/compare/v1.3.4...v1.3.5) (2020-06-30)

### [1.3.4](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/compare/v1.3.3...v1.3.4) (2020-06-09)

### [1.3.3](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/compare/v1.3.2...v1.3.3) (2020-05-27)

### [1.3.2](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/compare/v1.3.1...v1.3.2) (2020-05-18)

### [1.3.1](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/compare/v1.3.0...v1.3.1) (2020-05-08)


### Bug Fixes

* clean null values out of arrays ([#63](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/issues/63)) ([6b1f3e4](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/commit/6b1f3e4e8c4e9b191fbf70a5c79418b7eaa995a9))

## [1.3.0](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/compare/v1.2.0...v1.3.0) (2020-04-22)


### Features

* Add more debugging, including link to the ECS or CodeDeploy console ([#56](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/issues/56)) ([f0b3966](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/commit/f0b3966cfef41a73fc35f3001025fb9290b3673b))

## [1.2.0](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/compare/v1.1.0...v1.2.0) (2020-04-02)


### Features

* clean empty arrays and objects from the task def file ([#52](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/issues/52)) ([e64c8a6](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/commit/e64c8a6fd7cb8f40b6487fc0acd0a357cc1eaffd))

## [1.1.0](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/compare/v1.0.3...v1.1.0) (2020-03-05)


### Features

* add option to specify number of minutes to wait for deployment to complete ([#37](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/issues/37)) ([27c64c3](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/commit/27c64c3fabb355c8a4311a02eaf507f684adc033)), closes [#33](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/issues/33)

### [1.0.3](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/compare/v1.0.2...v1.0.3) (2020-02-06)

### [1.0.2](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/compare/v1.0.1...v1.0.2) (2020-02-06)


### Bug Fixes

* Ignore task definition fields that are Describe outputs, but not Register inputs ([70d7e5a](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/commit/70d7e5a70a160768b612a0d0db2820fb24259958)), closes [#22](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/issues/22)
* Match package version to current tag version ([2c12fa8](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/commit/2c12fa8bf9f89ea322d319c83cfcf8f3175bfbb1))
* Reduce error debugging ([7a9b7f7](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/commit/7a9b7f71e4f9b87151c1b4e3bde474db2eee1595))
