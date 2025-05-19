# Changelog

All notable changes to this project will be documented in this file. See [standard-version](https://github.com/conventional-changelog/standard-version) for commit guidelines.

### [2.3.2](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/compare/v2.3.1...v2.3.2) (2025-04-14)

### [2.3.1](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/compare/v2.3.0...v2.3.1) (2025-03-17)


### Bug Fixes

* propagate run-task-arn to outputs ([#740](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/issues/740)) ([ba4c50f](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/commit/ba4c50ff72022c29eca99b2b348bca524e6c1b0f))
* set propagateTags to null if unset ([6d07985](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/commit/6d079859a0107705ccbf1ede83cc3516807b1ecb))

## [2.3.0](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/compare/v2.2.0...v2.3.0) (2025-01-30)


### Features

* Add support for 'VolumeConfigurations' property on both UpdateService and RunTask API call ([#721](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/issues/721)) ([0bad458](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/commit/0bad458c6aa901707e510cd05b797b05da075633))

## [2.2.0](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/compare/v2.1.2...v2.2.0) (2024-12-06)


### Features

* add run-task-capacity-provider-strategy input ([#661](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/issues/661)) ([6ebedf4](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/commit/6ebedf489a59397e203a34a9cb7f85c8e303142c))


### Bug Fixes

* when no input enableECSManagedTagsInput, not include it to request params ([#669](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/issues/669)) ([e4558ed](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/commit/e4558ed83a830c66b168104c883a31784769e99c)), closes [#682](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/issues/682) [#683](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/issues/683) [#681](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/issues/681) [#679](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/issues/679)

### [2.1.2](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/compare/v2.1.1...v2.1.2) (2024-10-24)

### [2.1.1](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/compare/v2.1.0...v2.1.1) (2024-10-03)

## [2.1.0](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/compare/v2.0.0...v2.1.0) (2024-09-05)


### Features

* Enable AWS managed tags ([#622](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/issues/622)) ([5ae7be6](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/commit/5ae7be6fcfec491494b3dbe937800837321d81d9))
* Tags for services and ad-hoc run ([#629](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/issues/629)) ([1b137d4](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/commit/1b137d48136614359c0c3a573120ab771daa6320))


### Bug Fixes

* set networkConfiguration to null when using bridge network mode ([#617](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/issues/617)) ([0a1e247](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/commit/0a1e24711a61a2279b2bf40c6877fdbfd117997e))

## [2.0.0](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/compare/v1.6.0...v2.0.0) (2024-08-06)


### ⚠ BREAKING CHANGES

* AWS SDK v3 upgrade contains some backward incompatible changes.

### Features

* add ad-hoc task runs ([#304](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/issues/304)) ([b3a528e](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/commit/b3a528eb690c86037acd19fd6a2a86337f4e3657))
* add new parameters and tests to one-off task feature ([#593](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/issues/593)) ([67393b6](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/commit/67393b6dddfbf0653b20b162dcdd0d3821366bc4))
* Add CodeDeploy deployment config name parameter ([4b15394](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/commit/4b153949000fb656721f5a776216cb7e446d9f98))

### Bug Fixes

* Link to events v2 url ([#588](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/issues/588)) ([1a69dae](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/commit/1a69daea10712415b65b5c90f8c41b1b6b556ab5))
* pass maxWaitTime in seconds ([b5c6c3f](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/commit/b5c6c3fcbdf37b6f40a448364f91bfa3f824e3d0))
* waiter options ([a15de3c](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/commit/a15de3cf6c410374c35333dbbf96b183206ac0b7))

## [1.6.0](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/compare/v1.5.0...v1.6.0) (2024-07-18)

### Please note that this is a backward incompatible release with the upgrade to AWS SDK v3. We recommend using v2 of this Github action which includes the SDK upgrade, and update your task definition parameters to adhere to the specification defined in AWS documentation [here](https://docs.aws.amazon.com/AmazonECS/latest/developerguide/task_definition_parameters.html).
### Features

* Add CodeDeploy deployment config name parameter ([4b15394](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/commit/4b153949000fb656721f5a776216cb7e446d9f98))


### Bug Fixes

* pass maxWaitTime in seconds ([b5c6c3f](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/commit/b5c6c3fcbdf37b6f40a448364f91bfa3f824e3d0))
* waiter options ([a15de3c](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/commit/a15de3cf6c410374c35333dbbf96b183206ac0b7))

## [1.5.0](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/compare/v1.4.11...v1.5.0) (2024-05-07)


### Features

* Add desired tasks ([#505](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/issues/505)) ([e5f78d3](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/commit/e5f78d3088b0f4f96faca249870440a0001deaa3))

### [1.4.11](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/compare/v1.4.10...v1.4.11) (2023-01-04)

### [1.4.10](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/compare/v1.4.9...v1.4.10) (2022-09-30)


### Bug Fixes

* support new 'ECS' deployment type rather than relying on a null value ([#387](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/issues/387)) ([b74b034](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/commit/b74b034038701c2a78e7715e68f28b8fd49a14c7))
* Use correct host for China region console ([#309](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/issues/309)) ([bfe35b5](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/commit/bfe35b582b00dd351d71abc7af67f91e493c0802))

### [1.4.9](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/compare/v1.4.8...v1.4.9) (2022-01-18)


### Bug Fixes

* Strict Mode Deprecation ([ec3c2b2](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/commit/ec3c2b2d3e7138039c827953d14cccbedc99ae23))

### [1.4.8](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/compare/v1.4.7...v1.4.8) (2021-11-23)

### [1.4.7](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/compare/v1.4.6...v1.4.7) (2021-07-13)


### Bug Fixes

* Container Definition Environment variables are being removed when empty ([#224](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/issues/224)) ([632a7fa](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/commit/632a7fad2a714a363ed824224a88254c429236d5))

### [1.4.6](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/compare/v1.4.5...v1.4.6) (2021-06-02)


### Bug Fixes

* Cannot read property 'length' of undefined ([#202](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/issues/202)) ([8009d7d](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/commit/8009d7da6ac76c5f49983585decef599d9916042))

### [1.4.5](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/compare/v1.4.4...v1.4.5) (2021-05-10)

### [1.4.4](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/compare/v1.4.3...v1.4.4) (2021-02-23)

### [1.4.3](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/compare/v1.4.2...v1.4.3) (2021-02-08)


### Bug Fixes

* allow empty values in proxyConfiguration.properties ([#168](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/issues/168)) ([3963f7f](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/commit/3963f7f3050f9c64b285d6a437b3d447a73131f3)), closes [#163](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/issues/163)
* enable forceNewDeployment for ECS Task that is broken per [#157](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/issues/157) ([#159](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/issues/159)) ([4b6d445](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/commit/4b6d44541b0b3e5871a0eb4265d8c35a35cbb215))

### [1.4.2](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/compare/v1.4.1...v1.4.2) (2021-01-26)


### Bug Fixes

* ignore additional fields from task definition input ([#165](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/issues/165)) ([7727942](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/commit/77279428f4b2e987d6c03366891893fb8161c1e4))

### [1.4.1](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/compare/v1.4.0...v1.4.1) (2020-12-22)


### Bug Fixes

* forceNewDeployment input to take a boolean ([#150](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/issues/150)) ([06f69cf](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/commit/06f69cf0d8243e21900f315a65772f40e9b508a2))
* forceNewDeployment to be a boolean ([#140](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/issues/140)) ([9407da9](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/commit/9407da9865a8d6b2d45c8239daeaff7203b49d45))

## [1.4.0](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/compare/v1.3.10...v1.4.0) (2020-10-29)


### Features

* allow forceNewDeployment ([#116](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/issues/116)) ([f2d330f](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/commit/f2d330fcd84477fa5332a7f18acb483c21e31bee))

### [1.3.10](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/compare/v1.3.9...v1.3.10) (2020-09-29)

### [1.3.9](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/compare/v1.3.8...v1.3.9) (2020-08-25)

### [1.3.8](https://github.com/aws-actions/amazon-ecs-deploy-task-definition/compare/v1.3.7...v1.3.8) (2020-08-11)

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
