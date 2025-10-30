"use strict";
exports.id = 360;
exports.ids = [360];
exports.modules = {

/***/ 5360:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {



var sharedIniFileLoader = __webpack_require__(4964);
var propertyProvider = __webpack_require__(1238);
var child_process = __webpack_require__(5317);
var util = __webpack_require__(9023);
var client = __webpack_require__(5152);

const getValidatedProcessCredentials = (profileName, data, profiles) => {
    if (data.Version !== 1) {
        throw Error(`Profile ${profileName} credential_process did not return Version 1.`);
    }
    if (data.AccessKeyId === undefined || data.SecretAccessKey === undefined) {
        throw Error(`Profile ${profileName} credential_process returned invalid credentials.`);
    }
    if (data.Expiration) {
        const currentTime = new Date();
        const expireTime = new Date(data.Expiration);
        if (expireTime < currentTime) {
            throw Error(`Profile ${profileName} credential_process returned expired credentials.`);
        }
    }
    let accountId = data.AccountId;
    if (!accountId && profiles?.[profileName]?.aws_account_id) {
        accountId = profiles[profileName].aws_account_id;
    }
    const credentials = {
        accessKeyId: data.AccessKeyId,
        secretAccessKey: data.SecretAccessKey,
        ...(data.SessionToken && { sessionToken: data.SessionToken }),
        ...(data.Expiration && { expiration: new Date(data.Expiration) }),
        ...(data.CredentialScope && { credentialScope: data.CredentialScope }),
        ...(accountId && { accountId }),
    };
    client.setCredentialFeature(credentials, "CREDENTIALS_PROCESS", "w");
    return credentials;
};

const resolveProcessCredentials = async (profileName, profiles, logger) => {
    const profile = profiles[profileName];
    if (profiles[profileName]) {
        const credentialProcess = profile["credential_process"];
        if (credentialProcess !== undefined) {
            const execPromise = util.promisify(sharedIniFileLoader.externalDataInterceptor?.getTokenRecord?.().exec ?? child_process.exec);
            try {
                const { stdout } = await execPromise(credentialProcess);
                let data;
                try {
                    data = JSON.parse(stdout.trim());
                }
                catch {
                    throw Error(`Profile ${profileName} credential_process returned invalid JSON.`);
                }
                return getValidatedProcessCredentials(profileName, data, profiles);
            }
            catch (error) {
                throw new propertyProvider.CredentialsProviderError(error.message, { logger });
            }
        }
        else {
            throw new propertyProvider.CredentialsProviderError(`Profile ${profileName} did not contain credential_process.`, { logger });
        }
    }
    else {
        throw new propertyProvider.CredentialsProviderError(`Profile ${profileName} could not be found in shared credentials file.`, {
            logger,
        });
    }
};

const fromProcess = (init = {}) => async ({ callerClientConfig } = {}) => {
    init.logger?.debug("@aws-sdk/credential-provider-process - fromProcess");
    const profiles = await sharedIniFileLoader.parseKnownFiles(init);
    return resolveProcessCredentials(sharedIniFileLoader.getProfileName({
        profile: init.profile ?? callerClientConfig?.profile,
    }), profiles, init.logger);
};

exports.fromProcess = fromProcess;


/***/ })

};
;