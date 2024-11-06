# Amazon ECS "Deploy Task Definition" Action for GitHub Actions — Integration Tests

This branch contains the Integration Tests workflow and resources.

Although it would be ideal for integration tests to be ran once a pull request has been approved, this is unfeasible because the Integration Test workflow would have to run on the requester's fork, which, unlike the original repository, does not have access to testing accounts.