"use strict";
exports.id = 869;
exports.ids = [869];
exports.modules = {

/***/ 75869:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {



var sharedIniFileLoader = __webpack_require__(46459);
var propertyProvider = __webpack_require__(78215);
var client = __webpack_require__(5152);

const resolveCredentialSource = (credentialSource, profileName, logger) => {
    const sourceProvidersMap = {
        EcsContainer: async (options) => {
            const { fromHttp } = await __webpack_require__.e(/* import() */ 605).then(__webpack_require__.bind(__webpack_require__, 98605));
            const { fromContainerMetadata } = await Promise.resolve(/* import() */).then(__webpack_require__.t.bind(__webpack_require__, 40566, 19));
            logger?.debug("@aws-sdk/credential-provider-ini - credential_source is EcsContainer");
            return async () => propertyProvider.chain(fromHttp(options ?? {}), fromContainerMetadata(options))().then(setNamedProvider);
        },
        Ec2InstanceMetadata: async (options) => {
            logger?.debug("@aws-sdk/credential-provider-ini - credential_source is Ec2InstanceMetadata");
            const { fromInstanceMetadata } = await Promise.resolve(/* import() */).then(__webpack_require__.t.bind(__webpack_require__, 40566, 19));
            return async () => fromInstanceMetadata(options)().then(setNamedProvider);
        },
        Environment: async (options) => {
            logger?.debug("@aws-sdk/credential-provider-ini - credential_source is Environment");
            const { fromEnv } = await Promise.resolve(/* import() */).then(__webpack_require__.t.bind(__webpack_require__, 55606, 19));
            return async () => fromEnv(options)().then(setNamedProvider);
        },
    };
    if (credentialSource in sourceProvidersMap) {
        return sourceProvidersMap[credentialSource];
    }
    else {
        throw new propertyProvider.CredentialsProviderError(`Unsupported credential source in profile ${profileName}. Got ${credentialSource}, ` +
            `expected EcsContainer or Ec2InstanceMetadata or Environment.`, { logger });
    }
};
const setNamedProvider = (creds) => client.setCredentialFeature(creds, "CREDENTIALS_PROFILE_NAMED_PROVIDER", "p");

const isAssumeRoleProfile = (arg, { profile = "default", logger } = {}) => {
    return (Boolean(arg) &&
        typeof arg === "object" &&
        typeof arg.role_arn === "string" &&
        ["undefined", "string"].indexOf(typeof arg.role_session_name) > -1 &&
        ["undefined", "string"].indexOf(typeof arg.external_id) > -1 &&
        ["undefined", "string"].indexOf(typeof arg.mfa_serial) > -1 &&
        (isAssumeRoleWithSourceProfile(arg, { profile, logger }) || isCredentialSourceProfile(arg, { profile, logger })));
};
const isAssumeRoleWithSourceProfile = (arg, { profile, logger }) => {
    const withSourceProfile = typeof arg.source_profile === "string" && typeof arg.credential_source === "undefined";
    if (withSourceProfile) {
        logger?.debug?.(`    ${profile} isAssumeRoleWithSourceProfile source_profile=${arg.source_profile}`);
    }
    return withSourceProfile;
};
const isCredentialSourceProfile = (arg, { profile, logger }) => {
    const withProviderProfile = typeof arg.credential_source === "string" && typeof arg.source_profile === "undefined";
    if (withProviderProfile) {
        logger?.debug?.(`    ${profile} isCredentialSourceProfile credential_source=${arg.credential_source}`);
    }
    return withProviderProfile;
};
const resolveAssumeRoleCredentials = async (profileName, profiles, options, visitedProfiles = {}, resolveProfileData) => {
    options.logger?.debug("@aws-sdk/credential-provider-ini - resolveAssumeRoleCredentials (STS)");
    const profileData = profiles[profileName];
    const { source_profile, region } = profileData;
    if (!options.roleAssumer) {
        const { getDefaultRoleAssumer } = await Promise.all(/* import() */[__webpack_require__.e(755), __webpack_require__.e(136)]).then(__webpack_require__.t.bind(__webpack_require__, 1136, 23));
        options.roleAssumer = getDefaultRoleAssumer({
            ...options.clientConfig,
            credentialProviderLogger: options.logger,
            parentClientConfig: {
                ...options?.parentClientConfig,
                region: region ?? options?.parentClientConfig?.region,
            },
        }, options.clientPlugins);
    }
    if (source_profile && source_profile in visitedProfiles) {
        throw new propertyProvider.CredentialsProviderError(`Detected a cycle attempting to resolve credentials for profile` +
            ` ${sharedIniFileLoader.getProfileName(options)}. Profiles visited: ` +
            Object.keys(visitedProfiles).join(", "), { logger: options.logger });
    }
    options.logger?.debug(`@aws-sdk/credential-provider-ini - finding credential resolver using ${source_profile ? `source_profile=[${source_profile}]` : `profile=[${profileName}]`}`);
    const sourceCredsProvider = source_profile
        ? resolveProfileData(source_profile, profiles, options, {
            ...visitedProfiles,
            [source_profile]: true,
        }, isCredentialSourceWithoutRoleArn(profiles[source_profile] ?? {}))
        : (await resolveCredentialSource(profileData.credential_source, profileName, options.logger)(options))();
    if (isCredentialSourceWithoutRoleArn(profileData)) {
        return sourceCredsProvider.then((creds) => client.setCredentialFeature(creds, "CREDENTIALS_PROFILE_SOURCE_PROFILE", "o"));
    }
    else {
        const params = {
            RoleArn: profileData.role_arn,
            RoleSessionName: profileData.role_session_name || `aws-sdk-js-${Date.now()}`,
            ExternalId: profileData.external_id,
            DurationSeconds: parseInt(profileData.duration_seconds || "3600", 10),
        };
        const { mfa_serial } = profileData;
        if (mfa_serial) {
            if (!options.mfaCodeProvider) {
                throw new propertyProvider.CredentialsProviderError(`Profile ${profileName} requires multi-factor authentication, but no MFA code callback was provided.`, { logger: options.logger, tryNextLink: false });
            }
            params.SerialNumber = mfa_serial;
            params.TokenCode = await options.mfaCodeProvider(mfa_serial);
        }
        const sourceCreds = await sourceCredsProvider;
        return options.roleAssumer(sourceCreds, params).then((creds) => client.setCredentialFeature(creds, "CREDENTIALS_PROFILE_SOURCE_PROFILE", "o"));
    }
};
const isCredentialSourceWithoutRoleArn = (section) => {
    return !section.role_arn && !!section.credential_source;
};

const isProcessProfile = (arg) => Boolean(arg) && typeof arg === "object" && typeof arg.credential_process === "string";
const resolveProcessCredentials = async (options, profile) => __webpack_require__.e(/* import() */ 360).then(__webpack_require__.t.bind(__webpack_require__, 75360, 19)).then(({ fromProcess }) => fromProcess({
    ...options,
    profile,
})().then((creds) => client.setCredentialFeature(creds, "CREDENTIALS_PROFILE_PROCESS", "v")));

const resolveSsoCredentials = async (profile, profileData, options = {}) => {
    const { fromSSO } = await __webpack_require__.e(/* import() */ 998).then(__webpack_require__.t.bind(__webpack_require__, 60998, 19));
    return fromSSO({
        profile,
        logger: options.logger,
        parentClientConfig: options.parentClientConfig,
        clientConfig: options.clientConfig,
    })().then((creds) => {
        if (profileData.sso_session) {
            return client.setCredentialFeature(creds, "CREDENTIALS_PROFILE_SSO", "r");
        }
        else {
            return client.setCredentialFeature(creds, "CREDENTIALS_PROFILE_SSO_LEGACY", "t");
        }
    });
};
const isSsoProfile = (arg) => arg &&
    (typeof arg.sso_start_url === "string" ||
        typeof arg.sso_account_id === "string" ||
        typeof arg.sso_session === "string" ||
        typeof arg.sso_region === "string" ||
        typeof arg.sso_role_name === "string");

const isStaticCredsProfile = (arg) => Boolean(arg) &&
    typeof arg === "object" &&
    typeof arg.aws_access_key_id === "string" &&
    typeof arg.aws_secret_access_key === "string" &&
    ["undefined", "string"].indexOf(typeof arg.aws_session_token) > -1 &&
    ["undefined", "string"].indexOf(typeof arg.aws_account_id) > -1;
const resolveStaticCredentials = async (profile, options) => {
    options?.logger?.debug("@aws-sdk/credential-provider-ini - resolveStaticCredentials");
    const credentials = {
        accessKeyId: profile.aws_access_key_id,
        secretAccessKey: profile.aws_secret_access_key,
        sessionToken: profile.aws_session_token,
        ...(profile.aws_credential_scope && { credentialScope: profile.aws_credential_scope }),
        ...(profile.aws_account_id && { accountId: profile.aws_account_id }),
    };
    return client.setCredentialFeature(credentials, "CREDENTIALS_PROFILE", "n");
};

const isWebIdentityProfile = (arg) => Boolean(arg) &&
    typeof arg === "object" &&
    typeof arg.web_identity_token_file === "string" &&
    typeof arg.role_arn === "string" &&
    ["undefined", "string"].indexOf(typeof arg.role_session_name) > -1;
const resolveWebIdentityCredentials = async (profile, options) => Promise.all(/* import() */[__webpack_require__.e(755), __webpack_require__.e(136), __webpack_require__.e(956)]).then(__webpack_require__.t.bind(__webpack_require__, 29956, 23)).then(({ fromTokenFile }) => fromTokenFile({
    webIdentityTokenFile: profile.web_identity_token_file,
    roleArn: profile.role_arn,
    roleSessionName: profile.role_session_name,
    roleAssumerWithWebIdentity: options.roleAssumerWithWebIdentity,
    logger: options.logger,
    parentClientConfig: options.parentClientConfig,
})().then((creds) => client.setCredentialFeature(creds, "CREDENTIALS_PROFILE_STS_WEB_ID_TOKEN", "q")));

const resolveProfileData = async (profileName, profiles, options, visitedProfiles = {}, isAssumeRoleRecursiveCall = false) => {
    const data = profiles[profileName];
    if (Object.keys(visitedProfiles).length > 0 && isStaticCredsProfile(data)) {
        return resolveStaticCredentials(data, options);
    }
    if (isAssumeRoleRecursiveCall || isAssumeRoleProfile(data, { profile: profileName, logger: options.logger })) {
        return resolveAssumeRoleCredentials(profileName, profiles, options, visitedProfiles, resolveProfileData);
    }
    if (isStaticCredsProfile(data)) {
        return resolveStaticCredentials(data, options);
    }
    if (isWebIdentityProfile(data)) {
        return resolveWebIdentityCredentials(data, options);
    }
    if (isProcessProfile(data)) {
        return resolveProcessCredentials(options, profileName);
    }
    if (isSsoProfile(data)) {
        return await resolveSsoCredentials(profileName, data, options);
    }
    throw new propertyProvider.CredentialsProviderError(`Could not resolve credentials using profile: [${profileName}] in configuration/credentials file(s).`, { logger: options.logger });
};

const fromIni = (_init = {}) => async ({ callerClientConfig } = {}) => {
    const init = {
        ..._init,
        parentClientConfig: {
            ...callerClientConfig,
            ..._init.parentClientConfig,
        },
    };
    init.logger?.debug("@aws-sdk/credential-provider-ini - fromIni");
    const profiles = await sharedIniFileLoader.parseKnownFiles(init);
    return resolveProfileData(sharedIniFileLoader.getProfileName({
        profile: _init.profile ?? callerClientConfig?.profile,
    }), profiles, init);
};

exports.fromIni = fromIni;


/***/ }),

/***/ 78215:
/***/ ((__unused_webpack_module, exports) => {



class ProviderError extends Error {
    name = "ProviderError";
    tryNextLink;
    constructor(message, options = true) {
        let logger;
        let tryNextLink = true;
        if (typeof options === "boolean") {
            logger = undefined;
            tryNextLink = options;
        }
        else if (options != null && typeof options === "object") {
            logger = options.logger;
            tryNextLink = options.tryNextLink ?? true;
        }
        super(message);
        this.tryNextLink = tryNextLink;
        Object.setPrototypeOf(this, ProviderError.prototype);
        logger?.debug?.(`@smithy/property-provider ${tryNextLink ? "->" : "(!)"} ${message}`);
    }
    static from(error, options = true) {
        return Object.assign(new this(error.message, options), error);
    }
}

class CredentialsProviderError extends ProviderError {
    name = "CredentialsProviderError";
    constructor(message, options = true) {
        super(message, options);
        Object.setPrototypeOf(this, CredentialsProviderError.prototype);
    }
}

class TokenProviderError extends ProviderError {
    name = "TokenProviderError";
    constructor(message, options = true) {
        super(message, options);
        Object.setPrototypeOf(this, TokenProviderError.prototype);
    }
}

const chain = (...providers) => async () => {
    if (providers.length === 0) {
        throw new ProviderError("No providers in chain");
    }
    let lastProviderError;
    for (const provider of providers) {
        try {
            const credentials = await provider();
            return credentials;
        }
        catch (err) {
            lastProviderError = err;
            if (err?.tryNextLink) {
                continue;
            }
            throw err;
        }
    }
    throw lastProviderError;
};

const fromStatic = (staticValue) => () => Promise.resolve(staticValue);

const memoize = (provider, isExpired, requiresRefresh) => {
    let resolved;
    let pending;
    let hasResult;
    let isConstant = false;
    const coalesceProvider = async () => {
        if (!pending) {
            pending = provider();
        }
        try {
            resolved = await pending;
            hasResult = true;
            isConstant = false;
        }
        finally {
            pending = undefined;
        }
        return resolved;
    };
    if (isExpired === undefined) {
        return async (options) => {
            if (!hasResult || options?.forceRefresh) {
                resolved = await coalesceProvider();
            }
            return resolved;
        };
    }
    return async (options) => {
        if (!hasResult || options?.forceRefresh) {
            resolved = await coalesceProvider();
        }
        if (isConstant) {
            return resolved;
        }
        if (requiresRefresh && !requiresRefresh(resolved)) {
            isConstant = true;
            return resolved;
        }
        if (isExpired(resolved)) {
            await coalesceProvider();
            return resolved;
        }
        return resolved;
    };
};

exports.CredentialsProviderError = CredentialsProviderError;
exports.ProviderError = ProviderError;
exports.TokenProviderError = TokenProviderError;
exports.chain = chain;
exports.fromStatic = fromStatic;
exports.memoize = memoize;


/***/ }),

/***/ 27981:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getHomeDir = void 0;
const os_1 = __webpack_require__(70857);
const path_1 = __webpack_require__(16928);
const homeDirCache = {};
const getHomeDirCacheKey = () => {
    if (process && process.geteuid) {
        return `${process.geteuid()}`;
    }
    return "DEFAULT";
};
const getHomeDir = () => {
    const { HOME, USERPROFILE, HOMEPATH, HOMEDRIVE = `C:${path_1.sep}` } = process.env;
    if (HOME)
        return HOME;
    if (USERPROFILE)
        return USERPROFILE;
    if (HOMEPATH)
        return `${HOMEDRIVE}${HOMEPATH}`;
    const homeDirCacheKey = getHomeDirCacheKey();
    if (!homeDirCache[homeDirCacheKey])
        homeDirCache[homeDirCacheKey] = (0, os_1.homedir)();
    return homeDirCache[homeDirCacheKey];
};
exports.getHomeDir = getHomeDir;


/***/ }),

/***/ 68282:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getSSOTokenFilepath = void 0;
const crypto_1 = __webpack_require__(76982);
const path_1 = __webpack_require__(16928);
const getHomeDir_1 = __webpack_require__(27981);
const getSSOTokenFilepath = (id) => {
    const hasher = (0, crypto_1.createHash)("sha1");
    const cacheName = hasher.update(id).digest("hex");
    return (0, path_1.join)((0, getHomeDir_1.getHomeDir)(), ".aws", "sso", "cache", `${cacheName}.json`);
};
exports.getSSOTokenFilepath = getSSOTokenFilepath;


/***/ }),

/***/ 33517:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getSSOTokenFromFile = exports.tokenIntercept = void 0;
const fs_1 = __webpack_require__(79896);
const getSSOTokenFilepath_1 = __webpack_require__(68282);
const { readFile } = fs_1.promises;
exports.tokenIntercept = {};
const getSSOTokenFromFile = async (id) => {
    if (exports.tokenIntercept[id]) {
        return exports.tokenIntercept[id];
    }
    const ssoTokenFilepath = (0, getSSOTokenFilepath_1.getSSOTokenFilepath)(id);
    const ssoTokenText = await readFile(ssoTokenFilepath, "utf8");
    return JSON.parse(ssoTokenText);
};
exports.getSSOTokenFromFile = getSSOTokenFromFile;


/***/ }),

/***/ 46459:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {



var getHomeDir = __webpack_require__(27981);
var getSSOTokenFilepath = __webpack_require__(68282);
var getSSOTokenFromFile = __webpack_require__(33517);
var path = __webpack_require__(16928);
var types = __webpack_require__(20351);
var slurpFile = __webpack_require__(31221);

const ENV_PROFILE = "AWS_PROFILE";
const DEFAULT_PROFILE = "default";
const getProfileName = (init) => init.profile || process.env[ENV_PROFILE] || DEFAULT_PROFILE;

const CONFIG_PREFIX_SEPARATOR = ".";

const getConfigData = (data) => Object.entries(data)
    .filter(([key]) => {
    const indexOfSeparator = key.indexOf(CONFIG_PREFIX_SEPARATOR);
    if (indexOfSeparator === -1) {
        return false;
    }
    return Object.values(types.IniSectionType).includes(key.substring(0, indexOfSeparator));
})
    .reduce((acc, [key, value]) => {
    const indexOfSeparator = key.indexOf(CONFIG_PREFIX_SEPARATOR);
    const updatedKey = key.substring(0, indexOfSeparator) === types.IniSectionType.PROFILE ? key.substring(indexOfSeparator + 1) : key;
    acc[updatedKey] = value;
    return acc;
}, {
    ...(data.default && { default: data.default }),
});

const ENV_CONFIG_PATH = "AWS_CONFIG_FILE";
const getConfigFilepath = () => process.env[ENV_CONFIG_PATH] || path.join(getHomeDir.getHomeDir(), ".aws", "config");

const ENV_CREDENTIALS_PATH = "AWS_SHARED_CREDENTIALS_FILE";
const getCredentialsFilepath = () => process.env[ENV_CREDENTIALS_PATH] || path.join(getHomeDir.getHomeDir(), ".aws", "credentials");

const prefixKeyRegex = /^([\w-]+)\s(["'])?([\w-@\+\.%:/]+)\2$/;
const profileNameBlockList = ["__proto__", "profile __proto__"];
const parseIni = (iniData) => {
    const map = {};
    let currentSection;
    let currentSubSection;
    for (const iniLine of iniData.split(/\r?\n/)) {
        const trimmedLine = iniLine.split(/(^|\s)[;#]/)[0].trim();
        const isSection = trimmedLine[0] === "[" && trimmedLine[trimmedLine.length - 1] === "]";
        if (isSection) {
            currentSection = undefined;
            currentSubSection = undefined;
            const sectionName = trimmedLine.substring(1, trimmedLine.length - 1);
            const matches = prefixKeyRegex.exec(sectionName);
            if (matches) {
                const [, prefix, , name] = matches;
                if (Object.values(types.IniSectionType).includes(prefix)) {
                    currentSection = [prefix, name].join(CONFIG_PREFIX_SEPARATOR);
                }
            }
            else {
                currentSection = sectionName;
            }
            if (profileNameBlockList.includes(sectionName)) {
                throw new Error(`Found invalid profile name "${sectionName}"`);
            }
        }
        else if (currentSection) {
            const indexOfEqualsSign = trimmedLine.indexOf("=");
            if (![0, -1].includes(indexOfEqualsSign)) {
                const [name, value] = [
                    trimmedLine.substring(0, indexOfEqualsSign).trim(),
                    trimmedLine.substring(indexOfEqualsSign + 1).trim(),
                ];
                if (value === "") {
                    currentSubSection = name;
                }
                else {
                    if (currentSubSection && iniLine.trimStart() === iniLine) {
                        currentSubSection = undefined;
                    }
                    map[currentSection] = map[currentSection] || {};
                    const key = currentSubSection ? [currentSubSection, name].join(CONFIG_PREFIX_SEPARATOR) : name;
                    map[currentSection][key] = value;
                }
            }
        }
    }
    return map;
};

const swallowError$1 = () => ({});
const loadSharedConfigFiles = async (init = {}) => {
    const { filepath = getCredentialsFilepath(), configFilepath = getConfigFilepath() } = init;
    const homeDir = getHomeDir.getHomeDir();
    const relativeHomeDirPrefix = "~/";
    let resolvedFilepath = filepath;
    if (filepath.startsWith(relativeHomeDirPrefix)) {
        resolvedFilepath = path.join(homeDir, filepath.slice(2));
    }
    let resolvedConfigFilepath = configFilepath;
    if (configFilepath.startsWith(relativeHomeDirPrefix)) {
        resolvedConfigFilepath = path.join(homeDir, configFilepath.slice(2));
    }
    const parsedFiles = await Promise.all([
        slurpFile.slurpFile(resolvedConfigFilepath, {
            ignoreCache: init.ignoreCache,
        })
            .then(parseIni)
            .then(getConfigData)
            .catch(swallowError$1),
        slurpFile.slurpFile(resolvedFilepath, {
            ignoreCache: init.ignoreCache,
        })
            .then(parseIni)
            .catch(swallowError$1),
    ]);
    return {
        configFile: parsedFiles[0],
        credentialsFile: parsedFiles[1],
    };
};

const getSsoSessionData = (data) => Object.entries(data)
    .filter(([key]) => key.startsWith(types.IniSectionType.SSO_SESSION + CONFIG_PREFIX_SEPARATOR))
    .reduce((acc, [key, value]) => ({ ...acc, [key.substring(key.indexOf(CONFIG_PREFIX_SEPARATOR) + 1)]: value }), {});

const swallowError = () => ({});
const loadSsoSessionData = async (init = {}) => slurpFile.slurpFile(init.configFilepath ?? getConfigFilepath())
    .then(parseIni)
    .then(getSsoSessionData)
    .catch(swallowError);

const mergeConfigFiles = (...files) => {
    const merged = {};
    for (const file of files) {
        for (const [key, values] of Object.entries(file)) {
            if (merged[key] !== undefined) {
                Object.assign(merged[key], values);
            }
            else {
                merged[key] = values;
            }
        }
    }
    return merged;
};

const parseKnownFiles = async (init) => {
    const parsedFiles = await loadSharedConfigFiles(init);
    return mergeConfigFiles(parsedFiles.configFile, parsedFiles.credentialsFile);
};

const externalDataInterceptor = {
    getFileRecord() {
        return slurpFile.fileIntercept;
    },
    interceptFile(path, contents) {
        slurpFile.fileIntercept[path] = Promise.resolve(contents);
    },
    getTokenRecord() {
        return getSSOTokenFromFile.tokenIntercept;
    },
    interceptToken(id, contents) {
        getSSOTokenFromFile.tokenIntercept[id] = contents;
    },
};

Object.defineProperty(exports, "getSSOTokenFromFile", ({
    enumerable: true,
    get: function () { return getSSOTokenFromFile.getSSOTokenFromFile; }
}));
exports.CONFIG_PREFIX_SEPARATOR = CONFIG_PREFIX_SEPARATOR;
exports.DEFAULT_PROFILE = DEFAULT_PROFILE;
exports.ENV_PROFILE = ENV_PROFILE;
exports.externalDataInterceptor = externalDataInterceptor;
exports.getProfileName = getProfileName;
exports.loadSharedConfigFiles = loadSharedConfigFiles;
exports.loadSsoSessionData = loadSsoSessionData;
exports.parseKnownFiles = parseKnownFiles;
Object.keys(getHomeDir).forEach(function (k) {
    if (k !== 'default' && !Object.prototype.hasOwnProperty.call(exports, k)) Object.defineProperty(exports, k, {
        enumerable: true,
        get: function () { return getHomeDir[k]; }
    });
});
Object.keys(getSSOTokenFilepath).forEach(function (k) {
    if (k !== 'default' && !Object.prototype.hasOwnProperty.call(exports, k)) Object.defineProperty(exports, k, {
        enumerable: true,
        get: function () { return getSSOTokenFilepath[k]; }
    });
});


/***/ }),

/***/ 31221:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.slurpFile = exports.fileIntercept = exports.filePromisesHash = void 0;
const fs_1 = __webpack_require__(79896);
const { readFile } = fs_1.promises;
exports.filePromisesHash = {};
exports.fileIntercept = {};
const slurpFile = (path, options) => {
    if (exports.fileIntercept[path] !== undefined) {
        return exports.fileIntercept[path];
    }
    if (!exports.filePromisesHash[path] || options?.ignoreCache) {
        exports.filePromisesHash[path] = readFile(path, "utf8");
    }
    return exports.filePromisesHash[path];
};
exports.slurpFile = slurpFile;


/***/ }),

/***/ 20351:
/***/ ((__unused_webpack_module, exports) => {



exports.HttpAuthLocation = void 0;
(function (HttpAuthLocation) {
    HttpAuthLocation["HEADER"] = "header";
    HttpAuthLocation["QUERY"] = "query";
})(exports.HttpAuthLocation || (exports.HttpAuthLocation = {}));

exports.HttpApiKeyAuthLocation = void 0;
(function (HttpApiKeyAuthLocation) {
    HttpApiKeyAuthLocation["HEADER"] = "header";
    HttpApiKeyAuthLocation["QUERY"] = "query";
})(exports.HttpApiKeyAuthLocation || (exports.HttpApiKeyAuthLocation = {}));

exports.EndpointURLScheme = void 0;
(function (EndpointURLScheme) {
    EndpointURLScheme["HTTP"] = "http";
    EndpointURLScheme["HTTPS"] = "https";
})(exports.EndpointURLScheme || (exports.EndpointURLScheme = {}));

exports.AlgorithmId = void 0;
(function (AlgorithmId) {
    AlgorithmId["MD5"] = "md5";
    AlgorithmId["CRC32"] = "crc32";
    AlgorithmId["CRC32C"] = "crc32c";
    AlgorithmId["SHA1"] = "sha1";
    AlgorithmId["SHA256"] = "sha256";
})(exports.AlgorithmId || (exports.AlgorithmId = {}));
const getChecksumConfiguration = (runtimeConfig) => {
    const checksumAlgorithms = [];
    if (runtimeConfig.sha256 !== undefined) {
        checksumAlgorithms.push({
            algorithmId: () => exports.AlgorithmId.SHA256,
            checksumConstructor: () => runtimeConfig.sha256,
        });
    }
    if (runtimeConfig.md5 != undefined) {
        checksumAlgorithms.push({
            algorithmId: () => exports.AlgorithmId.MD5,
            checksumConstructor: () => runtimeConfig.md5,
        });
    }
    return {
        addChecksumAlgorithm(algo) {
            checksumAlgorithms.push(algo);
        },
        checksumAlgorithms() {
            return checksumAlgorithms;
        },
    };
};
const resolveChecksumRuntimeConfig = (clientConfig) => {
    const runtimeConfig = {};
    clientConfig.checksumAlgorithms().forEach((checksumAlgorithm) => {
        runtimeConfig[checksumAlgorithm.algorithmId()] = checksumAlgorithm.checksumConstructor();
    });
    return runtimeConfig;
};

const getDefaultClientConfiguration = (runtimeConfig) => {
    return getChecksumConfiguration(runtimeConfig);
};
const resolveDefaultRuntimeConfig = (config) => {
    return resolveChecksumRuntimeConfig(config);
};

exports.FieldPosition = void 0;
(function (FieldPosition) {
    FieldPosition[FieldPosition["HEADER"] = 0] = "HEADER";
    FieldPosition[FieldPosition["TRAILER"] = 1] = "TRAILER";
})(exports.FieldPosition || (exports.FieldPosition = {}));

const SMITHY_CONTEXT_KEY = "__smithy_context";

exports.IniSectionType = void 0;
(function (IniSectionType) {
    IniSectionType["PROFILE"] = "profile";
    IniSectionType["SSO_SESSION"] = "sso-session";
    IniSectionType["SERVICES"] = "services";
})(exports.IniSectionType || (exports.IniSectionType = {}));

exports.RequestHandlerProtocol = void 0;
(function (RequestHandlerProtocol) {
    RequestHandlerProtocol["HTTP_0_9"] = "http/0.9";
    RequestHandlerProtocol["HTTP_1_0"] = "http/1.0";
    RequestHandlerProtocol["TDS_8_0"] = "tds/8.0";
})(exports.RequestHandlerProtocol || (exports.RequestHandlerProtocol = {}));

exports.SMITHY_CONTEXT_KEY = SMITHY_CONTEXT_KEY;
exports.getDefaultClientConfiguration = getDefaultClientConfiguration;
exports.resolveDefaultRuntimeConfig = resolveDefaultRuntimeConfig;


/***/ })

};
;