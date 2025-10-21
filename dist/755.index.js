"use strict";
exports.id = 755;
exports.ids = [755];
exports.modules = {

/***/ 22743:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {



var types = __webpack_require__(65165);
var utilMiddleware = __webpack_require__(99755);
var middlewareSerde = __webpack_require__(62654);
var protocolHttp = __webpack_require__(20843);
var protocols = __webpack_require__(14097);

const getSmithyContext = (context) => context[types.SMITHY_CONTEXT_KEY] || (context[types.SMITHY_CONTEXT_KEY] = {});

const resolveAuthOptions = (candidateAuthOptions, authSchemePreference) => {
    if (!authSchemePreference || authSchemePreference.length === 0) {
        return candidateAuthOptions;
    }
    const preferredAuthOptions = [];
    for (const preferredSchemeName of authSchemePreference) {
        for (const candidateAuthOption of candidateAuthOptions) {
            const candidateAuthSchemeName = candidateAuthOption.schemeId.split("#")[1];
            if (candidateAuthSchemeName === preferredSchemeName) {
                preferredAuthOptions.push(candidateAuthOption);
            }
        }
    }
    for (const candidateAuthOption of candidateAuthOptions) {
        if (!preferredAuthOptions.find(({ schemeId }) => schemeId === candidateAuthOption.schemeId)) {
            preferredAuthOptions.push(candidateAuthOption);
        }
    }
    return preferredAuthOptions;
};

function convertHttpAuthSchemesToMap(httpAuthSchemes) {
    const map = new Map();
    for (const scheme of httpAuthSchemes) {
        map.set(scheme.schemeId, scheme);
    }
    return map;
}
const httpAuthSchemeMiddleware = (config, mwOptions) => (next, context) => async (args) => {
    const options = config.httpAuthSchemeProvider(await mwOptions.httpAuthSchemeParametersProvider(config, context, args.input));
    const authSchemePreference = config.authSchemePreference ? await config.authSchemePreference() : [];
    const resolvedOptions = resolveAuthOptions(options, authSchemePreference);
    const authSchemes = convertHttpAuthSchemesToMap(config.httpAuthSchemes);
    const smithyContext = utilMiddleware.getSmithyContext(context);
    const failureReasons = [];
    for (const option of resolvedOptions) {
        const scheme = authSchemes.get(option.schemeId);
        if (!scheme) {
            failureReasons.push(`HttpAuthScheme \`${option.schemeId}\` was not enabled for this service.`);
            continue;
        }
        const identityProvider = scheme.identityProvider(await mwOptions.identityProviderConfigProvider(config));
        if (!identityProvider) {
            failureReasons.push(`HttpAuthScheme \`${option.schemeId}\` did not have an IdentityProvider configured.`);
            continue;
        }
        const { identityProperties = {}, signingProperties = {} } = option.propertiesExtractor?.(config, context) || {};
        option.identityProperties = Object.assign(option.identityProperties || {}, identityProperties);
        option.signingProperties = Object.assign(option.signingProperties || {}, signingProperties);
        smithyContext.selectedHttpAuthScheme = {
            httpAuthOption: option,
            identity: await identityProvider(option.identityProperties),
            signer: scheme.signer,
        };
        break;
    }
    if (!smithyContext.selectedHttpAuthScheme) {
        throw new Error(failureReasons.join("\n"));
    }
    return next(args);
};

const httpAuthSchemeEndpointRuleSetMiddlewareOptions = {
    step: "serialize",
    tags: ["HTTP_AUTH_SCHEME"],
    name: "httpAuthSchemeMiddleware",
    override: true,
    relation: "before",
    toMiddleware: "endpointV2Middleware",
};
const getHttpAuthSchemeEndpointRuleSetPlugin = (config, { httpAuthSchemeParametersProvider, identityProviderConfigProvider, }) => ({
    applyToStack: (clientStack) => {
        clientStack.addRelativeTo(httpAuthSchemeMiddleware(config, {
            httpAuthSchemeParametersProvider,
            identityProviderConfigProvider,
        }), httpAuthSchemeEndpointRuleSetMiddlewareOptions);
    },
});

const httpAuthSchemeMiddlewareOptions = {
    step: "serialize",
    tags: ["HTTP_AUTH_SCHEME"],
    name: "httpAuthSchemeMiddleware",
    override: true,
    relation: "before",
    toMiddleware: middlewareSerde.serializerMiddlewareOption.name,
};
const getHttpAuthSchemePlugin = (config, { httpAuthSchemeParametersProvider, identityProviderConfigProvider, }) => ({
    applyToStack: (clientStack) => {
        clientStack.addRelativeTo(httpAuthSchemeMiddleware(config, {
            httpAuthSchemeParametersProvider,
            identityProviderConfigProvider,
        }), httpAuthSchemeMiddlewareOptions);
    },
});

const defaultErrorHandler = (signingProperties) => (error) => {
    throw error;
};
const defaultSuccessHandler = (httpResponse, signingProperties) => { };
const httpSigningMiddleware = (config) => (next, context) => async (args) => {
    if (!protocolHttp.HttpRequest.isInstance(args.request)) {
        return next(args);
    }
    const smithyContext = utilMiddleware.getSmithyContext(context);
    const scheme = smithyContext.selectedHttpAuthScheme;
    if (!scheme) {
        throw new Error(`No HttpAuthScheme was selected: unable to sign request`);
    }
    const { httpAuthOption: { signingProperties = {} }, identity, signer, } = scheme;
    const output = await next({
        ...args,
        request: await signer.sign(args.request, identity, signingProperties),
    }).catch((signer.errorHandler || defaultErrorHandler)(signingProperties));
    (signer.successHandler || defaultSuccessHandler)(output.response, signingProperties);
    return output;
};

const httpSigningMiddlewareOptions = {
    step: "finalizeRequest",
    tags: ["HTTP_SIGNING"],
    name: "httpSigningMiddleware",
    aliases: ["apiKeyMiddleware", "tokenMiddleware", "awsAuthMiddleware"],
    override: true,
    relation: "after",
    toMiddleware: "retryMiddleware",
};
const getHttpSigningPlugin = (config) => ({
    applyToStack: (clientStack) => {
        clientStack.addRelativeTo(httpSigningMiddleware(), httpSigningMiddlewareOptions);
    },
});

const normalizeProvider = (input) => {
    if (typeof input === "function")
        return input;
    const promisified = Promise.resolve(input);
    return () => promisified;
};

const makePagedClientRequest = async (CommandCtor, client, input, withCommand = (_) => _, ...args) => {
    let command = new CommandCtor(input);
    command = withCommand(command) ?? command;
    return await client.send(command, ...args);
};
function createPaginator(ClientCtor, CommandCtor, inputTokenName, outputTokenName, pageSizeTokenName) {
    return async function* paginateOperation(config, input, ...additionalArguments) {
        const _input = input;
        let token = config.startingToken ?? _input[inputTokenName];
        let hasNext = true;
        let page;
        while (hasNext) {
            _input[inputTokenName] = token;
            if (pageSizeTokenName) {
                _input[pageSizeTokenName] = _input[pageSizeTokenName] ?? config.pageSize;
            }
            if (config.client instanceof ClientCtor) {
                page = await makePagedClientRequest(CommandCtor, config.client, input, config.withCommand, ...additionalArguments);
            }
            else {
                throw new Error(`Invalid client, expected instance of ${ClientCtor.name}`);
            }
            yield page;
            const prevToken = token;
            token = get(page, outputTokenName);
            hasNext = !!(token && (!config.stopOnSameToken || token !== prevToken));
        }
        return undefined;
    };
}
const get = (fromObject, path) => {
    let cursor = fromObject;
    const pathComponents = path.split(".");
    for (const step of pathComponents) {
        if (!cursor || typeof cursor !== "object") {
            return undefined;
        }
        cursor = cursor[step];
    }
    return cursor;
};

function setFeature(context, feature, value) {
    if (!context.__smithy_context) {
        context.__smithy_context = {
            features: {},
        };
    }
    else if (!context.__smithy_context.features) {
        context.__smithy_context.features = {};
    }
    context.__smithy_context.features[feature] = value;
}

class DefaultIdentityProviderConfig {
    authSchemes = new Map();
    constructor(config) {
        for (const [key, value] of Object.entries(config)) {
            if (value !== undefined) {
                this.authSchemes.set(key, value);
            }
        }
    }
    getIdentityProvider(schemeId) {
        return this.authSchemes.get(schemeId);
    }
}

class HttpApiKeyAuthSigner {
    async sign(httpRequest, identity, signingProperties) {
        if (!signingProperties) {
            throw new Error("request could not be signed with `apiKey` since the `name` and `in` signer properties are missing");
        }
        if (!signingProperties.name) {
            throw new Error("request could not be signed with `apiKey` since the `name` signer property is missing");
        }
        if (!signingProperties.in) {
            throw new Error("request could not be signed with `apiKey` since the `in` signer property is missing");
        }
        if (!identity.apiKey) {
            throw new Error("request could not be signed with `apiKey` since the `apiKey` is not defined");
        }
        const clonedRequest = protocolHttp.HttpRequest.clone(httpRequest);
        if (signingProperties.in === types.HttpApiKeyAuthLocation.QUERY) {
            clonedRequest.query[signingProperties.name] = identity.apiKey;
        }
        else if (signingProperties.in === types.HttpApiKeyAuthLocation.HEADER) {
            clonedRequest.headers[signingProperties.name] = signingProperties.scheme
                ? `${signingProperties.scheme} ${identity.apiKey}`
                : identity.apiKey;
        }
        else {
            throw new Error("request can only be signed with `apiKey` locations `query` or `header`, " +
                "but found: `" +
                signingProperties.in +
                "`");
        }
        return clonedRequest;
    }
}

class HttpBearerAuthSigner {
    async sign(httpRequest, identity, signingProperties) {
        const clonedRequest = protocolHttp.HttpRequest.clone(httpRequest);
        if (!identity.token) {
            throw new Error("request could not be signed with `token` since the `token` is not defined");
        }
        clonedRequest.headers["Authorization"] = `Bearer ${identity.token}`;
        return clonedRequest;
    }
}

class NoAuthSigner {
    async sign(httpRequest, identity, signingProperties) {
        return httpRequest;
    }
}

const createIsIdentityExpiredFunction = (expirationMs) => function isIdentityExpired(identity) {
    return doesIdentityRequireRefresh(identity) && identity.expiration.getTime() - Date.now() < expirationMs;
};
const EXPIRATION_MS = 300_000;
const isIdentityExpired = createIsIdentityExpiredFunction(EXPIRATION_MS);
const doesIdentityRequireRefresh = (identity) => identity.expiration !== undefined;
const memoizeIdentityProvider = (provider, isExpired, requiresRefresh) => {
    if (provider === undefined) {
        return undefined;
    }
    const normalizedProvider = typeof provider !== "function" ? async () => Promise.resolve(provider) : provider;
    let resolved;
    let pending;
    let hasResult;
    let isConstant = false;
    const coalesceProvider = async (options) => {
        if (!pending) {
            pending = normalizedProvider(options);
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
                resolved = await coalesceProvider(options);
            }
            return resolved;
        };
    }
    return async (options) => {
        if (!hasResult || options?.forceRefresh) {
            resolved = await coalesceProvider(options);
        }
        if (isConstant) {
            return resolved;
        }
        if (!requiresRefresh(resolved)) {
            isConstant = true;
            return resolved;
        }
        if (isExpired(resolved)) {
            await coalesceProvider(options);
            return resolved;
        }
        return resolved;
    };
};

Object.defineProperty(exports, "requestBuilder", ({
    enumerable: true,
    get: function () { return protocols.requestBuilder; }
}));
exports.DefaultIdentityProviderConfig = DefaultIdentityProviderConfig;
exports.EXPIRATION_MS = EXPIRATION_MS;
exports.HttpApiKeyAuthSigner = HttpApiKeyAuthSigner;
exports.HttpBearerAuthSigner = HttpBearerAuthSigner;
exports.NoAuthSigner = NoAuthSigner;
exports.createIsIdentityExpiredFunction = createIsIdentityExpiredFunction;
exports.createPaginator = createPaginator;
exports.doesIdentityRequireRefresh = doesIdentityRequireRefresh;
exports.getHttpAuthSchemeEndpointRuleSetPlugin = getHttpAuthSchemeEndpointRuleSetPlugin;
exports.getHttpAuthSchemePlugin = getHttpAuthSchemePlugin;
exports.getHttpSigningPlugin = getHttpSigningPlugin;
exports.getSmithyContext = getSmithyContext;
exports.httpAuthSchemeEndpointRuleSetMiddlewareOptions = httpAuthSchemeEndpointRuleSetMiddlewareOptions;
exports.httpAuthSchemeMiddleware = httpAuthSchemeMiddleware;
exports.httpAuthSchemeMiddlewareOptions = httpAuthSchemeMiddlewareOptions;
exports.httpSigningMiddleware = httpSigningMiddleware;
exports.httpSigningMiddlewareOptions = httpSigningMiddlewareOptions;
exports.isIdentityExpired = isIdentityExpired;
exports.memoizeIdentityProvider = memoizeIdentityProvider;
exports.normalizeProvider = normalizeProvider;
exports.setFeature = setFeature;


/***/ }),

/***/ 14097:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {



var utilStream = __webpack_require__(64691);
var schema = __webpack_require__(67635);
var serde = __webpack_require__(65409);
var protocolHttp = __webpack_require__(20843);
var utilBase64 = __webpack_require__(72722);
var utilUtf8 = __webpack_require__(46090);

const collectBody = async (streamBody = new Uint8Array(), context) => {
    if (streamBody instanceof Uint8Array) {
        return utilStream.Uint8ArrayBlobAdapter.mutate(streamBody);
    }
    if (!streamBody) {
        return utilStream.Uint8ArrayBlobAdapter.mutate(new Uint8Array());
    }
    const fromContext = context.streamCollector(streamBody);
    return utilStream.Uint8ArrayBlobAdapter.mutate(await fromContext);
};

function extendedEncodeURIComponent(str) {
    return encodeURIComponent(str).replace(/[!'()*]/g, function (c) {
        return "%" + c.charCodeAt(0).toString(16).toUpperCase();
    });
}

class SerdeContext {
    serdeContext;
    setSerdeContext(serdeContext) {
        this.serdeContext = serdeContext;
    }
}

class HttpProtocol extends SerdeContext {
    options;
    constructor(options) {
        super();
        this.options = options;
    }
    getRequestType() {
        return protocolHttp.HttpRequest;
    }
    getResponseType() {
        return protocolHttp.HttpResponse;
    }
    setSerdeContext(serdeContext) {
        this.serdeContext = serdeContext;
        this.serializer.setSerdeContext(serdeContext);
        this.deserializer.setSerdeContext(serdeContext);
        if (this.getPayloadCodec()) {
            this.getPayloadCodec().setSerdeContext(serdeContext);
        }
    }
    updateServiceEndpoint(request, endpoint) {
        if ("url" in endpoint) {
            request.protocol = endpoint.url.protocol;
            request.hostname = endpoint.url.hostname;
            request.port = endpoint.url.port ? Number(endpoint.url.port) : undefined;
            request.path = endpoint.url.pathname;
            request.fragment = endpoint.url.hash || void 0;
            request.username = endpoint.url.username || void 0;
            request.password = endpoint.url.password || void 0;
            if (!request.query) {
                request.query = {};
            }
            for (const [k, v] of endpoint.url.searchParams.entries()) {
                request.query[k] = v;
            }
            return request;
        }
        else {
            request.protocol = endpoint.protocol;
            request.hostname = endpoint.hostname;
            request.port = endpoint.port ? Number(endpoint.port) : undefined;
            request.path = endpoint.path;
            request.query = {
                ...endpoint.query,
            };
            return request;
        }
    }
    setHostPrefix(request, operationSchema, input) {
        const inputNs = schema.NormalizedSchema.of(operationSchema.input);
        const opTraits = schema.translateTraits(operationSchema.traits ?? {});
        if (opTraits.endpoint) {
            let hostPrefix = opTraits.endpoint?.[0];
            if (typeof hostPrefix === "string") {
                const hostLabelInputs = [...inputNs.structIterator()].filter(([, member]) => member.getMergedTraits().hostLabel);
                for (const [name] of hostLabelInputs) {
                    const replacement = input[name];
                    if (typeof replacement !== "string") {
                        throw new Error(`@smithy/core/schema - ${name} in input must be a string as hostLabel.`);
                    }
                    hostPrefix = hostPrefix.replace(`{${name}}`, replacement);
                }
                request.hostname = hostPrefix + request.hostname;
            }
        }
    }
    deserializeMetadata(output) {
        return {
            httpStatusCode: output.statusCode,
            requestId: output.headers["x-amzn-requestid"] ?? output.headers["x-amzn-request-id"] ?? output.headers["x-amz-request-id"],
            extendedRequestId: output.headers["x-amz-id-2"],
            cfId: output.headers["x-amz-cf-id"],
        };
    }
    async serializeEventStream({ eventStream, requestSchema, initialRequest, }) {
        const eventStreamSerde = await this.loadEventStreamCapability();
        return eventStreamSerde.serializeEventStream({
            eventStream,
            requestSchema,
            initialRequest,
        });
    }
    async deserializeEventStream({ response, responseSchema, initialResponseContainer, }) {
        const eventStreamSerde = await this.loadEventStreamCapability();
        return eventStreamSerde.deserializeEventStream({
            response,
            responseSchema,
            initialResponseContainer,
        });
    }
    async loadEventStreamCapability() {
        const { EventStreamSerde } = await __webpack_require__.e(/* import() */ 992).then(__webpack_require__.t.bind(__webpack_require__, 74992, 19));
        return new EventStreamSerde({
            marshaller: this.getEventStreamMarshaller(),
            serializer: this.serializer,
            deserializer: this.deserializer,
            serdeContext: this.serdeContext,
            defaultContentType: this.getDefaultContentType(),
        });
    }
    getDefaultContentType() {
        throw new Error(`@smithy/core/protocols - ${this.constructor.name} getDefaultContentType() implementation missing.`);
    }
    async deserializeHttpMessage(schema, context, response, arg4, arg5) {
        return [];
    }
    getEventStreamMarshaller() {
        const context = this.serdeContext;
        if (!context.eventStreamMarshaller) {
            throw new Error("@smithy/core - HttpProtocol: eventStreamMarshaller missing in serdeContext.");
        }
        return context.eventStreamMarshaller;
    }
}

class HttpBindingProtocol extends HttpProtocol {
    async serializeRequest(operationSchema, _input, context) {
        const input = {
            ...(_input ?? {}),
        };
        const serializer = this.serializer;
        const query = {};
        const headers = {};
        const endpoint = await context.endpoint();
        const ns = schema.NormalizedSchema.of(operationSchema?.input);
        const schema$1 = ns.getSchema();
        let hasNonHttpBindingMember = false;
        let payload;
        const request = new protocolHttp.HttpRequest({
            protocol: "",
            hostname: "",
            port: undefined,
            path: "",
            fragment: undefined,
            query: query,
            headers: headers,
            body: undefined,
        });
        if (endpoint) {
            this.updateServiceEndpoint(request, endpoint);
            this.setHostPrefix(request, operationSchema, input);
            const opTraits = schema.translateTraits(operationSchema.traits);
            if (opTraits.http) {
                request.method = opTraits.http[0];
                const [path, search] = opTraits.http[1].split("?");
                if (request.path == "/") {
                    request.path = path;
                }
                else {
                    request.path += path;
                }
                const traitSearchParams = new URLSearchParams(search ?? "");
                Object.assign(query, Object.fromEntries(traitSearchParams));
            }
        }
        for (const [memberName, memberNs] of ns.structIterator()) {
            const memberTraits = memberNs.getMergedTraits() ?? {};
            const inputMemberValue = input[memberName];
            if (inputMemberValue == null) {
                continue;
            }
            if (memberTraits.httpPayload) {
                const isStreaming = memberNs.isStreaming();
                if (isStreaming) {
                    const isEventStream = memberNs.isStructSchema();
                    if (isEventStream) {
                        if (input[memberName]) {
                            payload = await this.serializeEventStream({
                                eventStream: input[memberName],
                                requestSchema: ns,
                            });
                        }
                    }
                    else {
                        payload = inputMemberValue;
                    }
                }
                else {
                    serializer.write(memberNs, inputMemberValue);
                    payload = serializer.flush();
                }
                delete input[memberName];
            }
            else if (memberTraits.httpLabel) {
                serializer.write(memberNs, inputMemberValue);
                const replacement = serializer.flush();
                if (request.path.includes(`{${memberName}+}`)) {
                    request.path = request.path.replace(`{${memberName}+}`, replacement.split("/").map(extendedEncodeURIComponent).join("/"));
                }
                else if (request.path.includes(`{${memberName}}`)) {
                    request.path = request.path.replace(`{${memberName}}`, extendedEncodeURIComponent(replacement));
                }
                delete input[memberName];
            }
            else if (memberTraits.httpHeader) {
                serializer.write(memberNs, inputMemberValue);
                headers[memberTraits.httpHeader.toLowerCase()] = String(serializer.flush());
                delete input[memberName];
            }
            else if (typeof memberTraits.httpPrefixHeaders === "string") {
                for (const [key, val] of Object.entries(inputMemberValue)) {
                    const amalgam = memberTraits.httpPrefixHeaders + key;
                    serializer.write([memberNs.getValueSchema(), { httpHeader: amalgam }], val);
                    headers[amalgam.toLowerCase()] = serializer.flush();
                }
                delete input[memberName];
            }
            else if (memberTraits.httpQuery || memberTraits.httpQueryParams) {
                this.serializeQuery(memberNs, inputMemberValue, query);
                delete input[memberName];
            }
            else {
                hasNonHttpBindingMember = true;
            }
        }
        if (hasNonHttpBindingMember && input) {
            serializer.write(schema$1, input);
            payload = serializer.flush();
        }
        request.headers = headers;
        request.query = query;
        request.body = payload;
        return request;
    }
    serializeQuery(ns, data, query) {
        const serializer = this.serializer;
        const traits = ns.getMergedTraits();
        if (traits.httpQueryParams) {
            for (const [key, val] of Object.entries(data)) {
                if (!(key in query)) {
                    const valueSchema = ns.getValueSchema();
                    Object.assign(valueSchema.getMergedTraits(), {
                        ...traits,
                        httpQuery: key,
                        httpQueryParams: undefined,
                    });
                    this.serializeQuery(valueSchema, val, query);
                }
            }
            return;
        }
        if (ns.isListSchema()) {
            const sparse = !!ns.getMergedTraits().sparse;
            const buffer = [];
            for (const item of data) {
                serializer.write([ns.getValueSchema(), traits], item);
                const serializable = serializer.flush();
                if (sparse || serializable !== undefined) {
                    buffer.push(serializable);
                }
            }
            query[traits.httpQuery] = buffer;
        }
        else {
            serializer.write([ns, traits], data);
            query[traits.httpQuery] = serializer.flush();
        }
    }
    async deserializeResponse(operationSchema, context, response) {
        const deserializer = this.deserializer;
        const ns = schema.NormalizedSchema.of(operationSchema.output);
        const dataObject = {};
        if (response.statusCode >= 300) {
            const bytes = await collectBody(response.body, context);
            if (bytes.byteLength > 0) {
                Object.assign(dataObject, await deserializer.read(15, bytes));
            }
            await this.handleError(operationSchema, context, response, dataObject, this.deserializeMetadata(response));
            throw new Error("@smithy/core/protocols - HTTP Protocol error handler failed to throw.");
        }
        for (const header in response.headers) {
            const value = response.headers[header];
            delete response.headers[header];
            response.headers[header.toLowerCase()] = value;
        }
        const nonHttpBindingMembers = await this.deserializeHttpMessage(ns, context, response, dataObject);
        if (nonHttpBindingMembers.length) {
            const bytes = await collectBody(response.body, context);
            if (bytes.byteLength > 0) {
                const dataFromBody = await deserializer.read(ns, bytes);
                for (const member of nonHttpBindingMembers) {
                    dataObject[member] = dataFromBody[member];
                }
            }
        }
        dataObject.$metadata = this.deserializeMetadata(response);
        return dataObject;
    }
    async deserializeHttpMessage(schema$1, context, response, arg4, arg5) {
        let dataObject;
        if (arg4 instanceof Set) {
            dataObject = arg5;
        }
        else {
            dataObject = arg4;
        }
        const deserializer = this.deserializer;
        const ns = schema.NormalizedSchema.of(schema$1);
        const nonHttpBindingMembers = [];
        for (const [memberName, memberSchema] of ns.structIterator()) {
            const memberTraits = memberSchema.getMemberTraits();
            if (memberTraits.httpPayload) {
                const isStreaming = memberSchema.isStreaming();
                if (isStreaming) {
                    const isEventStream = memberSchema.isStructSchema();
                    if (isEventStream) {
                        dataObject[memberName] = await this.deserializeEventStream({
                            response,
                            responseSchema: ns,
                        });
                    }
                    else {
                        dataObject[memberName] = utilStream.sdkStreamMixin(response.body);
                    }
                }
                else if (response.body) {
                    const bytes = await collectBody(response.body, context);
                    if (bytes.byteLength > 0) {
                        dataObject[memberName] = await deserializer.read(memberSchema, bytes);
                    }
                }
            }
            else if (memberTraits.httpHeader) {
                const key = String(memberTraits.httpHeader).toLowerCase();
                const value = response.headers[key];
                if (null != value) {
                    if (memberSchema.isListSchema()) {
                        const headerListValueSchema = memberSchema.getValueSchema();
                        headerListValueSchema.getMergedTraits().httpHeader = key;
                        let sections;
                        if (headerListValueSchema.isTimestampSchema() &&
                            headerListValueSchema.getSchema() === 4) {
                            sections = serde.splitEvery(value, ",", 2);
                        }
                        else {
                            sections = serde.splitHeader(value);
                        }
                        const list = [];
                        for (const section of sections) {
                            list.push(await deserializer.read(headerListValueSchema, section.trim()));
                        }
                        dataObject[memberName] = list;
                    }
                    else {
                        dataObject[memberName] = await deserializer.read(memberSchema, value);
                    }
                }
            }
            else if (memberTraits.httpPrefixHeaders !== undefined) {
                dataObject[memberName] = {};
                for (const [header, value] of Object.entries(response.headers)) {
                    if (header.startsWith(memberTraits.httpPrefixHeaders)) {
                        const valueSchema = memberSchema.getValueSchema();
                        valueSchema.getMergedTraits().httpHeader = header;
                        dataObject[memberName][header.slice(memberTraits.httpPrefixHeaders.length)] = await deserializer.read(valueSchema, value);
                    }
                }
            }
            else if (memberTraits.httpResponseCode) {
                dataObject[memberName] = response.statusCode;
            }
            else {
                nonHttpBindingMembers.push(memberName);
            }
        }
        return nonHttpBindingMembers;
    }
}

class RpcProtocol extends HttpProtocol {
    async serializeRequest(operationSchema, input, context) {
        const serializer = this.serializer;
        const query = {};
        const headers = {};
        const endpoint = await context.endpoint();
        const ns = schema.NormalizedSchema.of(operationSchema?.input);
        const schema$1 = ns.getSchema();
        let payload;
        const request = new protocolHttp.HttpRequest({
            protocol: "",
            hostname: "",
            port: undefined,
            path: "/",
            fragment: undefined,
            query: query,
            headers: headers,
            body: undefined,
        });
        if (endpoint) {
            this.updateServiceEndpoint(request, endpoint);
            this.setHostPrefix(request, operationSchema, input);
        }
        const _input = {
            ...input,
        };
        if (input) {
            const eventStreamMember = ns.getEventStreamMember();
            if (eventStreamMember) {
                if (_input[eventStreamMember]) {
                    const initialRequest = {};
                    for (const [memberName, memberSchema] of ns.structIterator()) {
                        if (memberName !== eventStreamMember && _input[memberName]) {
                            serializer.write(memberSchema, _input[memberName]);
                            initialRequest[memberName] = serializer.flush();
                        }
                    }
                    payload = await this.serializeEventStream({
                        eventStream: _input[eventStreamMember],
                        requestSchema: ns,
                        initialRequest,
                    });
                }
            }
            else {
                serializer.write(schema$1, _input);
                payload = serializer.flush();
            }
        }
        request.headers = headers;
        request.query = query;
        request.body = payload;
        request.method = "POST";
        return request;
    }
    async deserializeResponse(operationSchema, context, response) {
        const deserializer = this.deserializer;
        const ns = schema.NormalizedSchema.of(operationSchema.output);
        const dataObject = {};
        if (response.statusCode >= 300) {
            const bytes = await collectBody(response.body, context);
            if (bytes.byteLength > 0) {
                Object.assign(dataObject, await deserializer.read(15, bytes));
            }
            await this.handleError(operationSchema, context, response, dataObject, this.deserializeMetadata(response));
            throw new Error("@smithy/core/protocols - RPC Protocol error handler failed to throw.");
        }
        for (const header in response.headers) {
            const value = response.headers[header];
            delete response.headers[header];
            response.headers[header.toLowerCase()] = value;
        }
        const eventStreamMember = ns.getEventStreamMember();
        if (eventStreamMember) {
            dataObject[eventStreamMember] = await this.deserializeEventStream({
                response,
                responseSchema: ns,
                initialResponseContainer: dataObject,
            });
        }
        else {
            const bytes = await collectBody(response.body, context);
            if (bytes.byteLength > 0) {
                Object.assign(dataObject, await deserializer.read(ns, bytes));
            }
        }
        dataObject.$metadata = this.deserializeMetadata(response);
        return dataObject;
    }
}

const resolvedPath = (resolvedPath, input, memberName, labelValueProvider, uriLabel, isGreedyLabel) => {
    if (input != null && input[memberName] !== undefined) {
        const labelValue = labelValueProvider();
        if (labelValue.length <= 0) {
            throw new Error("Empty value provided for input HTTP label: " + memberName + ".");
        }
        resolvedPath = resolvedPath.replace(uriLabel, isGreedyLabel
            ? labelValue
                .split("/")
                .map((segment) => extendedEncodeURIComponent(segment))
                .join("/")
            : extendedEncodeURIComponent(labelValue));
    }
    else {
        throw new Error("No value provided for input HTTP label: " + memberName + ".");
    }
    return resolvedPath;
};

function requestBuilder(input, context) {
    return new RequestBuilder(input, context);
}
class RequestBuilder {
    input;
    context;
    query = {};
    method = "";
    headers = {};
    path = "";
    body = null;
    hostname = "";
    resolvePathStack = [];
    constructor(input, context) {
        this.input = input;
        this.context = context;
    }
    async build() {
        const { hostname, protocol = "https", port, path: basePath } = await this.context.endpoint();
        this.path = basePath;
        for (const resolvePath of this.resolvePathStack) {
            resolvePath(this.path);
        }
        return new protocolHttp.HttpRequest({
            protocol,
            hostname: this.hostname || hostname,
            port,
            method: this.method,
            path: this.path,
            query: this.query,
            body: this.body,
            headers: this.headers,
        });
    }
    hn(hostname) {
        this.hostname = hostname;
        return this;
    }
    bp(uriLabel) {
        this.resolvePathStack.push((basePath) => {
            this.path = `${basePath?.endsWith("/") ? basePath.slice(0, -1) : basePath || ""}` + uriLabel;
        });
        return this;
    }
    p(memberName, labelValueProvider, uriLabel, isGreedyLabel) {
        this.resolvePathStack.push((path) => {
            this.path = resolvedPath(path, this.input, memberName, labelValueProvider, uriLabel, isGreedyLabel);
        });
        return this;
    }
    h(headers) {
        this.headers = headers;
        return this;
    }
    q(query) {
        this.query = query;
        return this;
    }
    b(body) {
        this.body = body;
        return this;
    }
    m(method) {
        this.method = method;
        return this;
    }
}

function determineTimestampFormat(ns, settings) {
    if (settings.timestampFormat.useTrait) {
        if (ns.isTimestampSchema() &&
            (ns.getSchema() === 5 ||
                ns.getSchema() === 6 ||
                ns.getSchema() === 7)) {
            return ns.getSchema();
        }
    }
    const { httpLabel, httpPrefixHeaders, httpHeader, httpQuery } = ns.getMergedTraits();
    const bindingFormat = settings.httpBindings
        ? typeof httpPrefixHeaders === "string" || Boolean(httpHeader)
            ? 6
            : Boolean(httpQuery) || Boolean(httpLabel)
                ? 5
                : undefined
        : undefined;
    return bindingFormat ?? settings.timestampFormat.default;
}

class FromStringShapeDeserializer extends SerdeContext {
    settings;
    constructor(settings) {
        super();
        this.settings = settings;
    }
    read(_schema, data) {
        const ns = schema.NormalizedSchema.of(_schema);
        if (ns.isListSchema()) {
            return serde.splitHeader(data).map((item) => this.read(ns.getValueSchema(), item));
        }
        if (ns.isBlobSchema()) {
            return (this.serdeContext?.base64Decoder ?? utilBase64.fromBase64)(data);
        }
        if (ns.isTimestampSchema()) {
            const format = determineTimestampFormat(ns, this.settings);
            switch (format) {
                case 5:
                    return serde._parseRfc3339DateTimeWithOffset(data);
                case 6:
                    return serde._parseRfc7231DateTime(data);
                case 7:
                    return serde._parseEpochTimestamp(data);
                default:
                    console.warn("Missing timestamp format, parsing value with Date constructor:", data);
                    return new Date(data);
            }
        }
        if (ns.isStringSchema()) {
            const mediaType = ns.getMergedTraits().mediaType;
            let intermediateValue = data;
            if (mediaType) {
                if (ns.getMergedTraits().httpHeader) {
                    intermediateValue = this.base64ToUtf8(intermediateValue);
                }
                const isJson = mediaType === "application/json" || mediaType.endsWith("+json");
                if (isJson) {
                    intermediateValue = serde.LazyJsonString.from(intermediateValue);
                }
                return intermediateValue;
            }
        }
        if (ns.isNumericSchema()) {
            return Number(data);
        }
        if (ns.isBigIntegerSchema()) {
            return BigInt(data);
        }
        if (ns.isBigDecimalSchema()) {
            return new serde.NumericValue(data, "bigDecimal");
        }
        if (ns.isBooleanSchema()) {
            return String(data).toLowerCase() === "true";
        }
        return data;
    }
    base64ToUtf8(base64String) {
        return (this.serdeContext?.utf8Encoder ?? utilUtf8.toUtf8)((this.serdeContext?.base64Decoder ?? utilBase64.fromBase64)(base64String));
    }
}

class HttpInterceptingShapeDeserializer extends SerdeContext {
    codecDeserializer;
    stringDeserializer;
    constructor(codecDeserializer, codecSettings) {
        super();
        this.codecDeserializer = codecDeserializer;
        this.stringDeserializer = new FromStringShapeDeserializer(codecSettings);
    }
    setSerdeContext(serdeContext) {
        this.stringDeserializer.setSerdeContext(serdeContext);
        this.codecDeserializer.setSerdeContext(serdeContext);
        this.serdeContext = serdeContext;
    }
    read(schema$1, data) {
        const ns = schema.NormalizedSchema.of(schema$1);
        const traits = ns.getMergedTraits();
        const toString = this.serdeContext?.utf8Encoder ?? utilUtf8.toUtf8;
        if (traits.httpHeader || traits.httpResponseCode) {
            return this.stringDeserializer.read(ns, toString(data));
        }
        if (traits.httpPayload) {
            if (ns.isBlobSchema()) {
                const toBytes = this.serdeContext?.utf8Decoder ?? utilUtf8.fromUtf8;
                if (typeof data === "string") {
                    return toBytes(data);
                }
                return data;
            }
            else if (ns.isStringSchema()) {
                if ("byteLength" in data) {
                    return toString(data);
                }
                return data;
            }
        }
        return this.codecDeserializer.read(ns, data);
    }
}

class ToStringShapeSerializer extends SerdeContext {
    settings;
    stringBuffer = "";
    constructor(settings) {
        super();
        this.settings = settings;
    }
    write(schema$1, value) {
        const ns = schema.NormalizedSchema.of(schema$1);
        switch (typeof value) {
            case "object":
                if (value === null) {
                    this.stringBuffer = "null";
                    return;
                }
                if (ns.isTimestampSchema()) {
                    if (!(value instanceof Date)) {
                        throw new Error(`@smithy/core/protocols - received non-Date value ${value} when schema expected Date in ${ns.getName(true)}`);
                    }
                    const format = determineTimestampFormat(ns, this.settings);
                    switch (format) {
                        case 5:
                            this.stringBuffer = value.toISOString().replace(".000Z", "Z");
                            break;
                        case 6:
                            this.stringBuffer = serde.dateToUtcString(value);
                            break;
                        case 7:
                            this.stringBuffer = String(value.getTime() / 1000);
                            break;
                        default:
                            console.warn("Missing timestamp format, using epoch seconds", value);
                            this.stringBuffer = String(value.getTime() / 1000);
                    }
                    return;
                }
                if (ns.isBlobSchema() && "byteLength" in value) {
                    this.stringBuffer = (this.serdeContext?.base64Encoder ?? utilBase64.toBase64)(value);
                    return;
                }
                if (ns.isListSchema() && Array.isArray(value)) {
                    let buffer = "";
                    for (const item of value) {
                        this.write([ns.getValueSchema(), ns.getMergedTraits()], item);
                        const headerItem = this.flush();
                        const serialized = ns.getValueSchema().isTimestampSchema() ? headerItem : serde.quoteHeader(headerItem);
                        if (buffer !== "") {
                            buffer += ", ";
                        }
                        buffer += serialized;
                    }
                    this.stringBuffer = buffer;
                    return;
                }
                this.stringBuffer = JSON.stringify(value, null, 2);
                break;
            case "string":
                const mediaType = ns.getMergedTraits().mediaType;
                let intermediateValue = value;
                if (mediaType) {
                    const isJson = mediaType === "application/json" || mediaType.endsWith("+json");
                    if (isJson) {
                        intermediateValue = serde.LazyJsonString.from(intermediateValue);
                    }
                    if (ns.getMergedTraits().httpHeader) {
                        this.stringBuffer = (this.serdeContext?.base64Encoder ?? utilBase64.toBase64)(intermediateValue.toString());
                        return;
                    }
                }
                this.stringBuffer = value;
                break;
            default:
                this.stringBuffer = String(value);
        }
    }
    flush() {
        const buffer = this.stringBuffer;
        this.stringBuffer = "";
        return buffer;
    }
}

class HttpInterceptingShapeSerializer {
    codecSerializer;
    stringSerializer;
    buffer;
    constructor(codecSerializer, codecSettings, stringSerializer = new ToStringShapeSerializer(codecSettings)) {
        this.codecSerializer = codecSerializer;
        this.stringSerializer = stringSerializer;
    }
    setSerdeContext(serdeContext) {
        this.codecSerializer.setSerdeContext(serdeContext);
        this.stringSerializer.setSerdeContext(serdeContext);
    }
    write(schema$1, value) {
        const ns = schema.NormalizedSchema.of(schema$1);
        const traits = ns.getMergedTraits();
        if (traits.httpHeader || traits.httpLabel || traits.httpQuery) {
            this.stringSerializer.write(ns, value);
            this.buffer = this.stringSerializer.flush();
            return;
        }
        return this.codecSerializer.write(ns, value);
    }
    flush() {
        if (this.buffer !== undefined) {
            const buffer = this.buffer;
            this.buffer = undefined;
            return buffer;
        }
        return this.codecSerializer.flush();
    }
}

exports.FromStringShapeDeserializer = FromStringShapeDeserializer;
exports.HttpBindingProtocol = HttpBindingProtocol;
exports.HttpInterceptingShapeDeserializer = HttpInterceptingShapeDeserializer;
exports.HttpInterceptingShapeSerializer = HttpInterceptingShapeSerializer;
exports.HttpProtocol = HttpProtocol;
exports.RequestBuilder = RequestBuilder;
exports.RpcProtocol = RpcProtocol;
exports.SerdeContext = SerdeContext;
exports.ToStringShapeSerializer = ToStringShapeSerializer;
exports.collectBody = collectBody;
exports.determineTimestampFormat = determineTimestampFormat;
exports.extendedEncodeURIComponent = extendedEncodeURIComponent;
exports.requestBuilder = requestBuilder;
exports.resolvedPath = resolvedPath;


/***/ }),

/***/ 67635:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {



var protocolHttp = __webpack_require__(20843);
var utilMiddleware = __webpack_require__(99755);

const deref = (schemaRef) => {
    if (typeof schemaRef === "function") {
        return schemaRef();
    }
    return schemaRef;
};

const operation = (namespace, name, traits, input, output) => ({
    name,
    namespace,
    traits,
    input,
    output,
});

const schemaDeserializationMiddleware = (config) => (next, context) => async (args) => {
    const { response } = await next(args);
    const { operationSchema } = utilMiddleware.getSmithyContext(context);
    const [, ns, n, t, i, o] = operationSchema ?? [];
    try {
        const parsed = await config.protocol.deserializeResponse(operation(ns, n, t, i, o), {
            ...config,
            ...context,
        }, response);
        return {
            response,
            output: parsed,
        };
    }
    catch (error) {
        Object.defineProperty(error, "$response", {
            value: response,
        });
        if (!("$metadata" in error)) {
            const hint = `Deserialization error: to see the raw response, inspect the hidden field {error}.$response on this object.`;
            try {
                error.message += "\n  " + hint;
            }
            catch (e) {
                if (!context.logger || context.logger?.constructor?.name === "NoOpLogger") {
                    console.warn(hint);
                }
                else {
                    context.logger?.warn?.(hint);
                }
            }
            if (typeof error.$responseBodyText !== "undefined") {
                if (error.$response) {
                    error.$response.body = error.$responseBodyText;
                }
            }
            try {
                if (protocolHttp.HttpResponse.isInstance(response)) {
                    const { headers = {} } = response;
                    const headerEntries = Object.entries(headers);
                    error.$metadata = {
                        httpStatusCode: response.statusCode,
                        requestId: findHeader(/^x-[\w-]+-request-?id$/, headerEntries),
                        extendedRequestId: findHeader(/^x-[\w-]+-id-2$/, headerEntries),
                        cfId: findHeader(/^x-[\w-]+-cf-id$/, headerEntries),
                    };
                }
            }
            catch (e) {
            }
        }
        throw error;
    }
};
const findHeader = (pattern, headers) => {
    return (headers.find(([k]) => {
        return k.match(pattern);
    }) || [void 0, void 0])[1];
};

const schemaSerializationMiddleware = (config) => (next, context) => async (args) => {
    const { operationSchema } = utilMiddleware.getSmithyContext(context);
    const [, ns, n, t, i, o] = operationSchema ?? [];
    const endpoint = context.endpointV2?.url && config.urlParser
        ? async () => config.urlParser(context.endpointV2.url)
        : config.endpoint;
    const request = await config.protocol.serializeRequest(operation(ns, n, t, i, o), args.input, {
        ...config,
        ...context,
        endpoint,
    });
    return next({
        ...args,
        request,
    });
};

const deserializerMiddlewareOption = {
    name: "deserializerMiddleware",
    step: "deserialize",
    tags: ["DESERIALIZER"],
    override: true,
};
const serializerMiddlewareOption = {
    name: "serializerMiddleware",
    step: "serialize",
    tags: ["SERIALIZER"],
    override: true,
};
function getSchemaSerdePlugin(config) {
    return {
        applyToStack: (commandStack) => {
            commandStack.add(schemaSerializationMiddleware(config), serializerMiddlewareOption);
            commandStack.add(schemaDeserializationMiddleware(config), deserializerMiddlewareOption);
            config.protocol.setSerdeContext(config);
        },
    };
}

class Schema {
    name;
    namespace;
    traits;
    static assign(instance, values) {
        const schema = Object.assign(instance, values);
        return schema;
    }
    static [Symbol.hasInstance](lhs) {
        const isPrototype = this.prototype.isPrototypeOf(lhs);
        if (!isPrototype && typeof lhs === "object" && lhs !== null) {
            const list = lhs;
            return list.symbol === this.symbol;
        }
        return isPrototype;
    }
    getName() {
        return this.namespace + "#" + this.name;
    }
}

class ListSchema extends Schema {
    static symbol = Symbol.for("@smithy/lis");
    name;
    traits;
    valueSchema;
    symbol = ListSchema.symbol;
}
const list = (namespace, name, traits, valueSchema) => Schema.assign(new ListSchema(), {
    name,
    namespace,
    traits,
    valueSchema,
});

class MapSchema extends Schema {
    static symbol = Symbol.for("@smithy/map");
    name;
    traits;
    keySchema;
    valueSchema;
    symbol = MapSchema.symbol;
}
const map = (namespace, name, traits, keySchema, valueSchema) => Schema.assign(new MapSchema(), {
    name,
    namespace,
    traits,
    keySchema,
    valueSchema,
});

class OperationSchema extends Schema {
    static symbol = Symbol.for("@smithy/ope");
    name;
    traits;
    input;
    output;
    symbol = OperationSchema.symbol;
}
const op = (namespace, name, traits, input, output) => Schema.assign(new OperationSchema(), {
    name,
    namespace,
    traits,
    input,
    output,
});

class StructureSchema extends Schema {
    static symbol = Symbol.for("@smithy/str");
    name;
    traits;
    memberNames;
    memberList;
    symbol = StructureSchema.symbol;
}
const struct = (namespace, name, traits, memberNames, memberList) => Schema.assign(new StructureSchema(), {
    name,
    namespace,
    traits,
    memberNames,
    memberList,
});

class ErrorSchema extends StructureSchema {
    static symbol = Symbol.for("@smithy/err");
    ctor;
    symbol = ErrorSchema.symbol;
}
const error = (namespace, name, traits, memberNames, memberList, ctor) => Schema.assign(new ErrorSchema(), {
    name,
    namespace,
    traits,
    memberNames,
    memberList,
    ctor: null,
});

function translateTraits(indicator) {
    if (typeof indicator === "object") {
        return indicator;
    }
    indicator = indicator | 0;
    const traits = {};
    let i = 0;
    for (const trait of [
        "httpLabel",
        "idempotent",
        "idempotencyToken",
        "sensitive",
        "httpPayload",
        "httpResponseCode",
        "httpQueryParams",
    ]) {
        if (((indicator >> i++) & 1) === 1) {
            traits[trait] = 1;
        }
    }
    return traits;
}

class NormalizedSchema {
    ref;
    memberName;
    static symbol = Symbol.for("@smithy/nor");
    symbol = NormalizedSchema.symbol;
    name;
    schema;
    _isMemberSchema;
    traits;
    memberTraits;
    normalizedTraits;
    constructor(ref, memberName) {
        this.ref = ref;
        this.memberName = memberName;
        const traitStack = [];
        let _ref = ref;
        let schema = ref;
        this._isMemberSchema = false;
        while (isMemberSchema(_ref)) {
            traitStack.push(_ref[1]);
            _ref = _ref[0];
            schema = deref(_ref);
            this._isMemberSchema = true;
        }
        if (traitStack.length > 0) {
            this.memberTraits = {};
            for (let i = traitStack.length - 1; i >= 0; --i) {
                const traitSet = traitStack[i];
                Object.assign(this.memberTraits, translateTraits(traitSet));
            }
        }
        else {
            this.memberTraits = 0;
        }
        if (schema instanceof NormalizedSchema) {
            const computedMemberTraits = this.memberTraits;
            Object.assign(this, schema);
            this.memberTraits = Object.assign({}, computedMemberTraits, schema.getMemberTraits(), this.getMemberTraits());
            this.normalizedTraits = void 0;
            this.memberName = memberName ?? schema.memberName;
            return;
        }
        this.schema = deref(schema);
        if (isStaticSchema(this.schema)) {
            this.name = `${this.schema[1]}#${this.schema[2]}`;
            this.traits = this.schema[3];
        }
        else {
            this.name = this.memberName ?? String(schema);
            this.traits = 0;
        }
        if (this._isMemberSchema && !memberName) {
            throw new Error(`@smithy/core/schema - NormalizedSchema member init ${this.getName(true)} missing member name.`);
        }
    }
    static [Symbol.hasInstance](lhs) {
        const isPrototype = this.prototype.isPrototypeOf(lhs);
        if (!isPrototype && typeof lhs === "object" && lhs !== null) {
            const ns = lhs;
            return ns.symbol === this.symbol;
        }
        return isPrototype;
    }
    static of(ref) {
        const sc = deref(ref);
        if (sc instanceof NormalizedSchema) {
            return sc;
        }
        if (isMemberSchema(sc)) {
            const [ns, traits] = sc;
            if (ns instanceof NormalizedSchema) {
                Object.assign(ns.getMergedTraits(), translateTraits(traits));
                return ns;
            }
            throw new Error(`@smithy/core/schema - may not init unwrapped member schema=${JSON.stringify(ref, null, 2)}.`);
        }
        return new NormalizedSchema(sc);
    }
    getSchema() {
        const sc = this.schema;
        if (sc[0] === 0) {
            return sc[4];
        }
        return sc;
    }
    getName(withNamespace = false) {
        const { name } = this;
        const short = !withNamespace && name && name.includes("#");
        return short ? name.split("#")[1] : name || undefined;
    }
    getMemberName() {
        return this.memberName;
    }
    isMemberSchema() {
        return this._isMemberSchema;
    }
    isListSchema() {
        const sc = this.getSchema();
        return typeof sc === "number"
            ? sc >= 64 && sc < 128
            : sc[0] === 1;
    }
    isMapSchema() {
        const sc = this.getSchema();
        return typeof sc === "number"
            ? sc >= 128 && sc <= 0b1111_1111
            : sc[0] === 2;
    }
    isStructSchema() {
        const sc = this.getSchema();
        return (sc[0] === 3 ||
            sc[0] === -3);
    }
    isBlobSchema() {
        const sc = this.getSchema();
        return sc === 21 || sc === 42;
    }
    isTimestampSchema() {
        const sc = this.getSchema();
        return (typeof sc === "number" &&
            sc >= 4 &&
            sc <= 7);
    }
    isUnitSchema() {
        return this.getSchema() === "unit";
    }
    isDocumentSchema() {
        return this.getSchema() === 15;
    }
    isStringSchema() {
        return this.getSchema() === 0;
    }
    isBooleanSchema() {
        return this.getSchema() === 2;
    }
    isNumericSchema() {
        return this.getSchema() === 1;
    }
    isBigIntegerSchema() {
        return this.getSchema() === 17;
    }
    isBigDecimalSchema() {
        return this.getSchema() === 19;
    }
    isStreaming() {
        const { streaming } = this.getMergedTraits();
        return !!streaming || this.getSchema() === 42;
    }
    isIdempotencyToken() {
        const match = (traits) => (traits & 0b0100) === 0b0100 ||
            !!traits?.idempotencyToken;
        const { normalizedTraits, traits, memberTraits } = this;
        return match(normalizedTraits) || match(traits) || match(memberTraits);
    }
    getMergedTraits() {
        return (this.normalizedTraits ??
            (this.normalizedTraits = {
                ...this.getOwnTraits(),
                ...this.getMemberTraits(),
            }));
    }
    getMemberTraits() {
        return translateTraits(this.memberTraits);
    }
    getOwnTraits() {
        return translateTraits(this.traits);
    }
    getKeySchema() {
        const [isDoc, isMap] = [this.isDocumentSchema(), this.isMapSchema()];
        if (!isDoc && !isMap) {
            throw new Error(`@smithy/core/schema - cannot get key for non-map: ${this.getName(true)}`);
        }
        const schema = this.getSchema();
        const memberSchema = isDoc
            ? 15
            : schema[4] ?? 0;
        return member([memberSchema, 0], "key");
    }
    getValueSchema() {
        const sc = this.getSchema();
        const [isDoc, isMap, isList] = [this.isDocumentSchema(), this.isMapSchema(), this.isListSchema()];
        const memberSchema = typeof sc === "number"
            ? 0b0011_1111 & sc
            : sc && typeof sc === "object" && (isMap || isList)
                ? sc[3 + sc[0]]
                : isDoc
                    ? 15
                    : void 0;
        if (memberSchema != null) {
            return member([memberSchema, 0], isMap ? "value" : "member");
        }
        throw new Error(`@smithy/core/schema - ${this.getName(true)} has no value member.`);
    }
    getMemberSchema(memberName) {
        const struct = this.getSchema();
        if (this.isStructSchema() && struct[4].includes(memberName)) {
            const i = struct[4].indexOf(memberName);
            const memberSchema = struct[5][i];
            return member(isMemberSchema(memberSchema) ? memberSchema : [memberSchema, 0], memberName);
        }
        if (this.isDocumentSchema()) {
            return member([15, 0], memberName);
        }
        throw new Error(`@smithy/core/schema - ${this.getName(true)} has no no member=${memberName}.`);
    }
    getMemberSchemas() {
        const buffer = {};
        try {
            for (const [k, v] of this.structIterator()) {
                buffer[k] = v;
            }
        }
        catch (ignored) { }
        return buffer;
    }
    getEventStreamMember() {
        if (this.isStructSchema()) {
            for (const [memberName, memberSchema] of this.structIterator()) {
                if (memberSchema.isStreaming() && memberSchema.isStructSchema()) {
                    return memberName;
                }
            }
        }
        return "";
    }
    *structIterator() {
        if (this.isUnitSchema()) {
            return;
        }
        if (!this.isStructSchema()) {
            throw new Error("@smithy/core/schema - cannot iterate non-struct schema.");
        }
        const struct = this.getSchema();
        for (let i = 0; i < struct[4].length; ++i) {
            yield [struct[4][i], member([struct[5][i], 0], struct[4][i])];
        }
    }
}
function member(memberSchema, memberName) {
    if (memberSchema instanceof NormalizedSchema) {
        return Object.assign(memberSchema, {
            memberName,
            _isMemberSchema: true,
        });
    }
    const internalCtorAccess = NormalizedSchema;
    return new internalCtorAccess(memberSchema, memberName);
}
const isMemberSchema = (sc) => Array.isArray(sc) && sc.length === 2;
const isStaticSchema = (sc) => Array.isArray(sc) && sc.length >= 5;

class SimpleSchema extends Schema {
    static symbol = Symbol.for("@smithy/sim");
    name;
    schemaRef;
    traits;
    symbol = SimpleSchema.symbol;
}
const sim = (namespace, name, schemaRef, traits) => Schema.assign(new SimpleSchema(), {
    name,
    namespace,
    traits,
    schemaRef,
});
const simAdapter = (namespace, name, traits, schemaRef) => Schema.assign(new SimpleSchema(), {
    name,
    namespace,
    traits,
    schemaRef,
});

const SCHEMA = {
    BLOB: 0b0001_0101,
    STREAMING_BLOB: 0b0010_1010,
    BOOLEAN: 0b0000_0010,
    STRING: 0b0000_0000,
    NUMERIC: 0b0000_0001,
    BIG_INTEGER: 0b0001_0001,
    BIG_DECIMAL: 0b0001_0011,
    DOCUMENT: 0b0000_1111,
    TIMESTAMP_DEFAULT: 0b0000_0100,
    TIMESTAMP_DATE_TIME: 0b0000_0101,
    TIMESTAMP_HTTP_DATE: 0b0000_0110,
    TIMESTAMP_EPOCH_SECONDS: 0b0000_0111,
    LIST_MODIFIER: 0b0100_0000,
    MAP_MODIFIER: 0b1000_0000,
};

class TypeRegistry {
    namespace;
    schemas;
    exceptions;
    static registries = new Map();
    constructor(namespace, schemas = new Map(), exceptions = new Map()) {
        this.namespace = namespace;
        this.schemas = schemas;
        this.exceptions = exceptions;
    }
    static for(namespace) {
        if (!TypeRegistry.registries.has(namespace)) {
            TypeRegistry.registries.set(namespace, new TypeRegistry(namespace));
        }
        return TypeRegistry.registries.get(namespace);
    }
    register(shapeId, schema) {
        const qualifiedName = this.normalizeShapeId(shapeId);
        const registry = TypeRegistry.for(qualifiedName.split("#")[0]);
        registry.schemas.set(qualifiedName, schema);
    }
    getSchema(shapeId) {
        const id = this.normalizeShapeId(shapeId);
        if (!this.schemas.has(id)) {
            throw new Error(`@smithy/core/schema - schema not found for ${id}`);
        }
        return this.schemas.get(id);
    }
    registerError(es, ctor) {
        const $error = es;
        const registry = TypeRegistry.for($error[1]);
        registry.schemas.set($error[1] + "#" + $error[2], $error);
        registry.exceptions.set($error, ctor);
    }
    getErrorCtor(es) {
        const $error = es;
        const registry = TypeRegistry.for($error[1]);
        return registry.exceptions.get($error);
    }
    getBaseException() {
        for (const exceptionKey of this.exceptions.keys()) {
            if (Array.isArray(exceptionKey)) {
                const [, ns, name] = exceptionKey;
                const id = ns + "#" + name;
                if (id.startsWith("smithy.ts.sdk.synthetic.") && id.endsWith("ServiceException")) {
                    return exceptionKey;
                }
            }
        }
        return undefined;
    }
    find(predicate) {
        return [...this.schemas.values()].find(predicate);
    }
    clear() {
        this.schemas.clear();
        this.exceptions.clear();
    }
    normalizeShapeId(shapeId) {
        if (shapeId.includes("#")) {
            return shapeId;
        }
        return this.namespace + "#" + shapeId;
    }
}

exports.ErrorSchema = ErrorSchema;
exports.ListSchema = ListSchema;
exports.MapSchema = MapSchema;
exports.NormalizedSchema = NormalizedSchema;
exports.OperationSchema = OperationSchema;
exports.SCHEMA = SCHEMA;
exports.Schema = Schema;
exports.SimpleSchema = SimpleSchema;
exports.StructureSchema = StructureSchema;
exports.TypeRegistry = TypeRegistry;
exports.deref = deref;
exports.deserializerMiddlewareOption = deserializerMiddlewareOption;
exports.error = error;
exports.getSchemaSerdePlugin = getSchemaSerdePlugin;
exports.isStaticSchema = isStaticSchema;
exports.list = list;
exports.map = map;
exports.op = op;
exports.operation = operation;
exports.serializerMiddlewareOption = serializerMiddlewareOption;
exports.sim = sim;
exports.simAdapter = simAdapter;
exports.struct = struct;
exports.translateTraits = translateTraits;


/***/ }),

/***/ 65409:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {



var uuid = __webpack_require__(90266);

const copyDocumentWithTransform = (source, schemaRef, transform = (_) => _) => source;

const parseBoolean = (value) => {
    switch (value) {
        case "true":
            return true;
        case "false":
            return false;
        default:
            throw new Error(`Unable to parse boolean value "${value}"`);
    }
};
const expectBoolean = (value) => {
    if (value === null || value === undefined) {
        return undefined;
    }
    if (typeof value === "number") {
        if (value === 0 || value === 1) {
            logger.warn(stackTraceWarning(`Expected boolean, got ${typeof value}: ${value}`));
        }
        if (value === 0) {
            return false;
        }
        if (value === 1) {
            return true;
        }
    }
    if (typeof value === "string") {
        const lower = value.toLowerCase();
        if (lower === "false" || lower === "true") {
            logger.warn(stackTraceWarning(`Expected boolean, got ${typeof value}: ${value}`));
        }
        if (lower === "false") {
            return false;
        }
        if (lower === "true") {
            return true;
        }
    }
    if (typeof value === "boolean") {
        return value;
    }
    throw new TypeError(`Expected boolean, got ${typeof value}: ${value}`);
};
const expectNumber = (value) => {
    if (value === null || value === undefined) {
        return undefined;
    }
    if (typeof value === "string") {
        const parsed = parseFloat(value);
        if (!Number.isNaN(parsed)) {
            if (String(parsed) !== String(value)) {
                logger.warn(stackTraceWarning(`Expected number but observed string: ${value}`));
            }
            return parsed;
        }
    }
    if (typeof value === "number") {
        return value;
    }
    throw new TypeError(`Expected number, got ${typeof value}: ${value}`);
};
const MAX_FLOAT = Math.ceil(2 ** 127 * (2 - 2 ** -23));
const expectFloat32 = (value) => {
    const expected = expectNumber(value);
    if (expected !== undefined && !Number.isNaN(expected) && expected !== Infinity && expected !== -Infinity) {
        if (Math.abs(expected) > MAX_FLOAT) {
            throw new TypeError(`Expected 32-bit float, got ${value}`);
        }
    }
    return expected;
};
const expectLong = (value) => {
    if (value === null || value === undefined) {
        return undefined;
    }
    if (Number.isInteger(value) && !Number.isNaN(value)) {
        return value;
    }
    throw new TypeError(`Expected integer, got ${typeof value}: ${value}`);
};
const expectInt = expectLong;
const expectInt32 = (value) => expectSizedInt(value, 32);
const expectShort = (value) => expectSizedInt(value, 16);
const expectByte = (value) => expectSizedInt(value, 8);
const expectSizedInt = (value, size) => {
    const expected = expectLong(value);
    if (expected !== undefined && castInt(expected, size) !== expected) {
        throw new TypeError(`Expected ${size}-bit integer, got ${value}`);
    }
    return expected;
};
const castInt = (value, size) => {
    switch (size) {
        case 32:
            return Int32Array.of(value)[0];
        case 16:
            return Int16Array.of(value)[0];
        case 8:
            return Int8Array.of(value)[0];
    }
};
const expectNonNull = (value, location) => {
    if (value === null || value === undefined) {
        if (location) {
            throw new TypeError(`Expected a non-null value for ${location}`);
        }
        throw new TypeError("Expected a non-null value");
    }
    return value;
};
const expectObject = (value) => {
    if (value === null || value === undefined) {
        return undefined;
    }
    if (typeof value === "object" && !Array.isArray(value)) {
        return value;
    }
    const receivedType = Array.isArray(value) ? "array" : typeof value;
    throw new TypeError(`Expected object, got ${receivedType}: ${value}`);
};
const expectString = (value) => {
    if (value === null || value === undefined) {
        return undefined;
    }
    if (typeof value === "string") {
        return value;
    }
    if (["boolean", "number", "bigint"].includes(typeof value)) {
        logger.warn(stackTraceWarning(`Expected string, got ${typeof value}: ${value}`));
        return String(value);
    }
    throw new TypeError(`Expected string, got ${typeof value}: ${value}`);
};
const expectUnion = (value) => {
    if (value === null || value === undefined) {
        return undefined;
    }
    const asObject = expectObject(value);
    const setKeys = Object.entries(asObject)
        .filter(([, v]) => v != null)
        .map(([k]) => k);
    if (setKeys.length === 0) {
        throw new TypeError(`Unions must have exactly one non-null member. None were found.`);
    }
    if (setKeys.length > 1) {
        throw new TypeError(`Unions must have exactly one non-null member. Keys ${setKeys} were not null.`);
    }
    return asObject;
};
const strictParseDouble = (value) => {
    if (typeof value == "string") {
        return expectNumber(parseNumber(value));
    }
    return expectNumber(value);
};
const strictParseFloat = strictParseDouble;
const strictParseFloat32 = (value) => {
    if (typeof value == "string") {
        return expectFloat32(parseNumber(value));
    }
    return expectFloat32(value);
};
const NUMBER_REGEX = /(-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?)|(-?Infinity)|(NaN)/g;
const parseNumber = (value) => {
    const matches = value.match(NUMBER_REGEX);
    if (matches === null || matches[0].length !== value.length) {
        throw new TypeError(`Expected real number, got implicit NaN`);
    }
    return parseFloat(value);
};
const limitedParseDouble = (value) => {
    if (typeof value == "string") {
        return parseFloatString(value);
    }
    return expectNumber(value);
};
const handleFloat = limitedParseDouble;
const limitedParseFloat = limitedParseDouble;
const limitedParseFloat32 = (value) => {
    if (typeof value == "string") {
        return parseFloatString(value);
    }
    return expectFloat32(value);
};
const parseFloatString = (value) => {
    switch (value) {
        case "NaN":
            return NaN;
        case "Infinity":
            return Infinity;
        case "-Infinity":
            return -Infinity;
        default:
            throw new Error(`Unable to parse float value: ${value}`);
    }
};
const strictParseLong = (value) => {
    if (typeof value === "string") {
        return expectLong(parseNumber(value));
    }
    return expectLong(value);
};
const strictParseInt = strictParseLong;
const strictParseInt32 = (value) => {
    if (typeof value === "string") {
        return expectInt32(parseNumber(value));
    }
    return expectInt32(value);
};
const strictParseShort = (value) => {
    if (typeof value === "string") {
        return expectShort(parseNumber(value));
    }
    return expectShort(value);
};
const strictParseByte = (value) => {
    if (typeof value === "string") {
        return expectByte(parseNumber(value));
    }
    return expectByte(value);
};
const stackTraceWarning = (message) => {
    return String(new TypeError(message).stack || message)
        .split("\n")
        .slice(0, 5)
        .filter((s) => !s.includes("stackTraceWarning"))
        .join("\n");
};
const logger = {
    warn: console.warn,
};

const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
function dateToUtcString(date) {
    const year = date.getUTCFullYear();
    const month = date.getUTCMonth();
    const dayOfWeek = date.getUTCDay();
    const dayOfMonthInt = date.getUTCDate();
    const hoursInt = date.getUTCHours();
    const minutesInt = date.getUTCMinutes();
    const secondsInt = date.getUTCSeconds();
    const dayOfMonthString = dayOfMonthInt < 10 ? `0${dayOfMonthInt}` : `${dayOfMonthInt}`;
    const hoursString = hoursInt < 10 ? `0${hoursInt}` : `${hoursInt}`;
    const minutesString = minutesInt < 10 ? `0${minutesInt}` : `${minutesInt}`;
    const secondsString = secondsInt < 10 ? `0${secondsInt}` : `${secondsInt}`;
    return `${DAYS[dayOfWeek]}, ${dayOfMonthString} ${MONTHS[month]} ${year} ${hoursString}:${minutesString}:${secondsString} GMT`;
}
const RFC3339 = new RegExp(/^(\d{4})-(\d{2})-(\d{2})[tT](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?[zZ]$/);
const parseRfc3339DateTime = (value) => {
    if (value === null || value === undefined) {
        return undefined;
    }
    if (typeof value !== "string") {
        throw new TypeError("RFC-3339 date-times must be expressed as strings");
    }
    const match = RFC3339.exec(value);
    if (!match) {
        throw new TypeError("Invalid RFC-3339 date-time value");
    }
    const [_, yearStr, monthStr, dayStr, hours, minutes, seconds, fractionalMilliseconds] = match;
    const year = strictParseShort(stripLeadingZeroes(yearStr));
    const month = parseDateValue(monthStr, "month", 1, 12);
    const day = parseDateValue(dayStr, "day", 1, 31);
    return buildDate(year, month, day, { hours, minutes, seconds, fractionalMilliseconds });
};
const RFC3339_WITH_OFFSET$1 = new RegExp(/^(\d{4})-(\d{2})-(\d{2})[tT](\d{2}):(\d{2}):(\d{2})(?:\.(\d+))?(([-+]\d{2}\:\d{2})|[zZ])$/);
const parseRfc3339DateTimeWithOffset = (value) => {
    if (value === null || value === undefined) {
        return undefined;
    }
    if (typeof value !== "string") {
        throw new TypeError("RFC-3339 date-times must be expressed as strings");
    }
    const match = RFC3339_WITH_OFFSET$1.exec(value);
    if (!match) {
        throw new TypeError("Invalid RFC-3339 date-time value");
    }
    const [_, yearStr, monthStr, dayStr, hours, minutes, seconds, fractionalMilliseconds, offsetStr] = match;
    const year = strictParseShort(stripLeadingZeroes(yearStr));
    const month = parseDateValue(monthStr, "month", 1, 12);
    const day = parseDateValue(dayStr, "day", 1, 31);
    const date = buildDate(year, month, day, { hours, minutes, seconds, fractionalMilliseconds });
    if (offsetStr.toUpperCase() != "Z") {
        date.setTime(date.getTime() - parseOffsetToMilliseconds(offsetStr));
    }
    return date;
};
const IMF_FIXDATE$1 = new RegExp(/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun), (\d{2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) (\d{4}) (\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))? GMT$/);
const RFC_850_DATE$1 = new RegExp(/^(?:Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday), (\d{2})-(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-(\d{2}) (\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))? GMT$/);
const ASC_TIME$1 = new RegExp(/^(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) ( [1-9]|\d{2}) (\d{1,2}):(\d{2}):(\d{2})(?:\.(\d+))? (\d{4})$/);
const parseRfc7231DateTime = (value) => {
    if (value === null || value === undefined) {
        return undefined;
    }
    if (typeof value !== "string") {
        throw new TypeError("RFC-7231 date-times must be expressed as strings");
    }
    let match = IMF_FIXDATE$1.exec(value);
    if (match) {
        const [_, dayStr, monthStr, yearStr, hours, minutes, seconds, fractionalMilliseconds] = match;
        return buildDate(strictParseShort(stripLeadingZeroes(yearStr)), parseMonthByShortName(monthStr), parseDateValue(dayStr, "day", 1, 31), { hours, minutes, seconds, fractionalMilliseconds });
    }
    match = RFC_850_DATE$1.exec(value);
    if (match) {
        const [_, dayStr, monthStr, yearStr, hours, minutes, seconds, fractionalMilliseconds] = match;
        return adjustRfc850Year(buildDate(parseTwoDigitYear(yearStr), parseMonthByShortName(monthStr), parseDateValue(dayStr, "day", 1, 31), {
            hours,
            minutes,
            seconds,
            fractionalMilliseconds,
        }));
    }
    match = ASC_TIME$1.exec(value);
    if (match) {
        const [_, monthStr, dayStr, hours, minutes, seconds, fractionalMilliseconds, yearStr] = match;
        return buildDate(strictParseShort(stripLeadingZeroes(yearStr)), parseMonthByShortName(monthStr), parseDateValue(dayStr.trimLeft(), "day", 1, 31), { hours, minutes, seconds, fractionalMilliseconds });
    }
    throw new TypeError("Invalid RFC-7231 date-time value");
};
const parseEpochTimestamp = (value) => {
    if (value === null || value === undefined) {
        return undefined;
    }
    let valueAsDouble;
    if (typeof value === "number") {
        valueAsDouble = value;
    }
    else if (typeof value === "string") {
        valueAsDouble = strictParseDouble(value);
    }
    else if (typeof value === "object" && value.tag === 1) {
        valueAsDouble = value.value;
    }
    else {
        throw new TypeError("Epoch timestamps must be expressed as floating point numbers or their string representation");
    }
    if (Number.isNaN(valueAsDouble) || valueAsDouble === Infinity || valueAsDouble === -Infinity) {
        throw new TypeError("Epoch timestamps must be valid, non-Infinite, non-NaN numerics");
    }
    return new Date(Math.round(valueAsDouble * 1000));
};
const buildDate = (year, month, day, time) => {
    const adjustedMonth = month - 1;
    validateDayOfMonth(year, adjustedMonth, day);
    return new Date(Date.UTC(year, adjustedMonth, day, parseDateValue(time.hours, "hour", 0, 23), parseDateValue(time.minutes, "minute", 0, 59), parseDateValue(time.seconds, "seconds", 0, 60), parseMilliseconds(time.fractionalMilliseconds)));
};
const parseTwoDigitYear = (value) => {
    const thisYear = new Date().getUTCFullYear();
    const valueInThisCentury = Math.floor(thisYear / 100) * 100 + strictParseShort(stripLeadingZeroes(value));
    if (valueInThisCentury < thisYear) {
        return valueInThisCentury + 100;
    }
    return valueInThisCentury;
};
const FIFTY_YEARS_IN_MILLIS = 50 * 365 * 24 * 60 * 60 * 1000;
const adjustRfc850Year = (input) => {
    if (input.getTime() - new Date().getTime() > FIFTY_YEARS_IN_MILLIS) {
        return new Date(Date.UTC(input.getUTCFullYear() - 100, input.getUTCMonth(), input.getUTCDate(), input.getUTCHours(), input.getUTCMinutes(), input.getUTCSeconds(), input.getUTCMilliseconds()));
    }
    return input;
};
const parseMonthByShortName = (value) => {
    const monthIdx = MONTHS.indexOf(value);
    if (monthIdx < 0) {
        throw new TypeError(`Invalid month: ${value}`);
    }
    return monthIdx + 1;
};
const DAYS_IN_MONTH = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
const validateDayOfMonth = (year, month, day) => {
    let maxDays = DAYS_IN_MONTH[month];
    if (month === 1 && isLeapYear(year)) {
        maxDays = 29;
    }
    if (day > maxDays) {
        throw new TypeError(`Invalid day for ${MONTHS[month]} in ${year}: ${day}`);
    }
};
const isLeapYear = (year) => {
    return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
};
const parseDateValue = (value, type, lower, upper) => {
    const dateVal = strictParseByte(stripLeadingZeroes(value));
    if (dateVal < lower || dateVal > upper) {
        throw new TypeError(`${type} must be between ${lower} and ${upper}, inclusive`);
    }
    return dateVal;
};
const parseMilliseconds = (value) => {
    if (value === null || value === undefined) {
        return 0;
    }
    return strictParseFloat32("0." + value) * 1000;
};
const parseOffsetToMilliseconds = (value) => {
    const directionStr = value[0];
    let direction = 1;
    if (directionStr == "+") {
        direction = 1;
    }
    else if (directionStr == "-") {
        direction = -1;
    }
    else {
        throw new TypeError(`Offset direction, ${directionStr}, must be "+" or "-"`);
    }
    const hour = Number(value.substring(1, 3));
    const minute = Number(value.substring(4, 6));
    return direction * (hour * 60 + minute) * 60 * 1000;
};
const stripLeadingZeroes = (value) => {
    let idx = 0;
    while (idx < value.length - 1 && value.charAt(idx) === "0") {
        idx++;
    }
    if (idx === 0) {
        return value;
    }
    return value.slice(idx);
};

const LazyJsonString = function LazyJsonString(val) {
    const str = Object.assign(new String(val), {
        deserializeJSON() {
            return JSON.parse(String(val));
        },
        toString() {
            return String(val);
        },
        toJSON() {
            return String(val);
        },
    });
    return str;
};
LazyJsonString.from = (object) => {
    if (object && typeof object === "object" && (object instanceof LazyJsonString || "deserializeJSON" in object)) {
        return object;
    }
    else if (typeof object === "string" || Object.getPrototypeOf(object) === String.prototype) {
        return LazyJsonString(String(object));
    }
    return LazyJsonString(JSON.stringify(object));
};
LazyJsonString.fromObject = LazyJsonString.from;

function quoteHeader(part) {
    if (part.includes(",") || part.includes('"')) {
        part = `"${part.replace(/"/g, '\\"')}"`;
    }
    return part;
}

const ddd = `(?:Mon|Tue|Wed|Thu|Fri|Sat|Sun)(?:[ne|u?r]?s?day)?`;
const mmm = `(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)`;
const time = `(\\d?\\d):(\\d{2}):(\\d{2})(?:\\.(\\d+))?`;
const date = `(\\d?\\d)`;
const year = `(\\d{4})`;
const RFC3339_WITH_OFFSET = new RegExp(/^(\d{4})-(\d\d)-(\d\d)[tT](\d\d):(\d\d):(\d\d)(\.(\d+))?(([-+]\d\d:\d\d)|[zZ])$/);
const IMF_FIXDATE = new RegExp(`^${ddd}, ${date} ${mmm} ${year} ${time} GMT$`);
const RFC_850_DATE = new RegExp(`^${ddd}, ${date}-${mmm}-(\\d\\d) ${time} GMT$`);
const ASC_TIME = new RegExp(`^${ddd} ${mmm} ( [1-9]|\\d\\d) ${time} ${year}$`);
const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const _parseEpochTimestamp = (value) => {
    if (value == null) {
        return void 0;
    }
    let num = NaN;
    if (typeof value === "number") {
        num = value;
    }
    else if (typeof value === "string") {
        if (!/^-?\d*\.?\d+$/.test(value)) {
            throw new TypeError(`parseEpochTimestamp - numeric string invalid.`);
        }
        num = Number.parseFloat(value);
    }
    else if (typeof value === "object" && value.tag === 1) {
        num = value.value;
    }
    if (isNaN(num) || Math.abs(num) === Infinity) {
        throw new TypeError("Epoch timestamps must be valid finite numbers.");
    }
    return new Date(Math.round(num * 1000));
};
const _parseRfc3339DateTimeWithOffset = (value) => {
    if (value == null) {
        return void 0;
    }
    if (typeof value !== "string") {
        throw new TypeError("RFC3339 timestamps must be strings");
    }
    const matches = RFC3339_WITH_OFFSET.exec(value);
    if (!matches) {
        throw new TypeError(`Invalid RFC3339 timestamp format ${value}`);
    }
    const [, yearStr, monthStr, dayStr, hours, minutes, seconds, , ms, offsetStr] = matches;
    range(monthStr, 1, 12);
    range(dayStr, 1, 31);
    range(hours, 0, 23);
    range(minutes, 0, 59);
    range(seconds, 0, 60);
    const date = new Date();
    date.setUTCFullYear(Number(yearStr), Number(monthStr) - 1, Number(dayStr));
    date.setUTCHours(Number(hours));
    date.setUTCMinutes(Number(minutes));
    date.setUTCSeconds(Number(seconds));
    date.setUTCMilliseconds(Number(ms) ? Math.round(parseFloat(`0.${ms}`) * 1000) : 0);
    if (offsetStr.toUpperCase() != "Z") {
        const [, sign, offsetH, offsetM] = /([+-])(\d\d):(\d\d)/.exec(offsetStr) || [void 0, "+", 0, 0];
        const scalar = sign === "-" ? 1 : -1;
        date.setTime(date.getTime() + scalar * (Number(offsetH) * 60 * 60 * 1000 + Number(offsetM) * 60 * 1000));
    }
    return date;
};
const _parseRfc7231DateTime = (value) => {
    if (value == null) {
        return void 0;
    }
    if (typeof value !== "string") {
        throw new TypeError("RFC7231 timestamps must be strings.");
    }
    let day;
    let month;
    let year;
    let hour;
    let minute;
    let second;
    let fraction;
    let matches;
    if ((matches = IMF_FIXDATE.exec(value))) {
        [, day, month, year, hour, minute, second, fraction] = matches;
    }
    else if ((matches = RFC_850_DATE.exec(value))) {
        [, day, month, year, hour, minute, second, fraction] = matches;
        year = (Number(year) + 1900).toString();
    }
    else if ((matches = ASC_TIME.exec(value))) {
        [, month, day, hour, minute, second, fraction, year] = matches;
    }
    if (year && second) {
        const date = new Date();
        date.setUTCFullYear(Number(year));
        date.setUTCMonth(months.indexOf(month));
        range(day, 1, 31);
        date.setUTCDate(Number(day));
        range(hour, 0, 23);
        date.setUTCHours(Number(hour));
        range(minute, 0, 59);
        date.setUTCMinutes(Number(minute));
        range(second, 0, 60);
        date.setUTCSeconds(Number(second));
        date.setUTCMilliseconds(fraction ? Math.round(parseFloat(`0.${fraction}`) * 1000) : 0);
        return date;
    }
    throw new TypeError(`Invalid RFC7231 date-time value ${value}.`);
};
function range(v, min, max) {
    const _v = Number(v);
    if (_v < min || _v > max) {
        throw new Error(`Value ${_v} out of range [${min}, ${max}]`);
    }
}

function splitEvery(value, delimiter, numDelimiters) {
    if (numDelimiters <= 0 || !Number.isInteger(numDelimiters)) {
        throw new Error("Invalid number of delimiters (" + numDelimiters + ") for splitEvery.");
    }
    const segments = value.split(delimiter);
    if (numDelimiters === 1) {
        return segments;
    }
    const compoundSegments = [];
    let currentSegment = "";
    for (let i = 0; i < segments.length; i++) {
        if (currentSegment === "") {
            currentSegment = segments[i];
        }
        else {
            currentSegment += delimiter + segments[i];
        }
        if ((i + 1) % numDelimiters === 0) {
            compoundSegments.push(currentSegment);
            currentSegment = "";
        }
    }
    if (currentSegment !== "") {
        compoundSegments.push(currentSegment);
    }
    return compoundSegments;
}

const splitHeader = (value) => {
    const z = value.length;
    const values = [];
    let withinQuotes = false;
    let prevChar = undefined;
    let anchor = 0;
    for (let i = 0; i < z; ++i) {
        const char = value[i];
        switch (char) {
            case `"`:
                if (prevChar !== "\\") {
                    withinQuotes = !withinQuotes;
                }
                break;
            case ",":
                if (!withinQuotes) {
                    values.push(value.slice(anchor, i));
                    anchor = i + 1;
                }
                break;
        }
        prevChar = char;
    }
    values.push(value.slice(anchor));
    return values.map((v) => {
        v = v.trim();
        const z = v.length;
        if (z < 2) {
            return v;
        }
        if (v[0] === `"` && v[z - 1] === `"`) {
            v = v.slice(1, z - 1);
        }
        return v.replace(/\\"/g, '"');
    });
};

const format = /^-?\d*(\.\d+)?$/;
class NumericValue {
    string;
    type;
    constructor(string, type) {
        this.string = string;
        this.type = type;
        if (!format.test(string)) {
            throw new Error(`@smithy/core/serde - NumericValue must only contain [0-9], at most one decimal point ".", and an optional negation prefix "-".`);
        }
    }
    toString() {
        return this.string;
    }
    static [Symbol.hasInstance](object) {
        if (!object || typeof object !== "object") {
            return false;
        }
        const _nv = object;
        return NumericValue.prototype.isPrototypeOf(object) || (_nv.type === "bigDecimal" && format.test(_nv.string));
    }
}
function nv(input) {
    return new NumericValue(String(input), "bigDecimal");
}

Object.defineProperty(exports, "generateIdempotencyToken", ({
    enumerable: true,
    get: function () { return uuid.v4; }
}));
exports.LazyJsonString = LazyJsonString;
exports.NumericValue = NumericValue;
exports._parseEpochTimestamp = _parseEpochTimestamp;
exports._parseRfc3339DateTimeWithOffset = _parseRfc3339DateTimeWithOffset;
exports._parseRfc7231DateTime = _parseRfc7231DateTime;
exports.copyDocumentWithTransform = copyDocumentWithTransform;
exports.dateToUtcString = dateToUtcString;
exports.expectBoolean = expectBoolean;
exports.expectByte = expectByte;
exports.expectFloat32 = expectFloat32;
exports.expectInt = expectInt;
exports.expectInt32 = expectInt32;
exports.expectLong = expectLong;
exports.expectNonNull = expectNonNull;
exports.expectNumber = expectNumber;
exports.expectObject = expectObject;
exports.expectShort = expectShort;
exports.expectString = expectString;
exports.expectUnion = expectUnion;
exports.handleFloat = handleFloat;
exports.limitedParseDouble = limitedParseDouble;
exports.limitedParseFloat = limitedParseFloat;
exports.limitedParseFloat32 = limitedParseFloat32;
exports.logger = logger;
exports.nv = nv;
exports.parseBoolean = parseBoolean;
exports.parseEpochTimestamp = parseEpochTimestamp;
exports.parseRfc3339DateTime = parseRfc3339DateTime;
exports.parseRfc3339DateTimeWithOffset = parseRfc3339DateTimeWithOffset;
exports.parseRfc7231DateTime = parseRfc7231DateTime;
exports.quoteHeader = quoteHeader;
exports.splitEvery = splitEvery;
exports.splitHeader = splitHeader;
exports.strictParseByte = strictParseByte;
exports.strictParseDouble = strictParseDouble;
exports.strictParseFloat = strictParseFloat;
exports.strictParseFloat32 = strictParseFloat32;
exports.strictParseInt = strictParseInt;
exports.strictParseInt32 = strictParseInt32;
exports.strictParseLong = strictParseLong;
exports.strictParseShort = strictParseShort;


/***/ }),

/***/ 9136:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {



var protocolHttp = __webpack_require__(20843);
var querystringBuilder = __webpack_require__(14959);
var utilBase64 = __webpack_require__(72722);

function createRequest(url, requestOptions) {
    return new Request(url, requestOptions);
}

function requestTimeout(timeoutInMs = 0) {
    return new Promise((resolve, reject) => {
        if (timeoutInMs) {
            setTimeout(() => {
                const timeoutError = new Error(`Request did not complete within ${timeoutInMs} ms`);
                timeoutError.name = "TimeoutError";
                reject(timeoutError);
            }, timeoutInMs);
        }
    });
}

const keepAliveSupport = {
    supported: undefined,
};
class FetchHttpHandler {
    config;
    configProvider;
    static create(instanceOrOptions) {
        if (typeof instanceOrOptions?.handle === "function") {
            return instanceOrOptions;
        }
        return new FetchHttpHandler(instanceOrOptions);
    }
    constructor(options) {
        if (typeof options === "function") {
            this.configProvider = options().then((opts) => opts || {});
        }
        else {
            this.config = options ?? {};
            this.configProvider = Promise.resolve(this.config);
        }
        if (keepAliveSupport.supported === undefined) {
            keepAliveSupport.supported = Boolean(typeof Request !== "undefined" && "keepalive" in createRequest("https://[::1]"));
        }
    }
    destroy() {
    }
    async handle(request, { abortSignal, requestTimeout: requestTimeout$1 } = {}) {
        if (!this.config) {
            this.config = await this.configProvider;
        }
        const requestTimeoutInMs = requestTimeout$1 ?? this.config.requestTimeout;
        const keepAlive = this.config.keepAlive === true;
        const credentials = this.config.credentials;
        if (abortSignal?.aborted) {
            const abortError = new Error("Request aborted");
            abortError.name = "AbortError";
            return Promise.reject(abortError);
        }
        let path = request.path;
        const queryString = querystringBuilder.buildQueryString(request.query || {});
        if (queryString) {
            path += `?${queryString}`;
        }
        if (request.fragment) {
            path += `#${request.fragment}`;
        }
        let auth = "";
        if (request.username != null || request.password != null) {
            const username = request.username ?? "";
            const password = request.password ?? "";
            auth = `${username}:${password}@`;
        }
        const { port, method } = request;
        const url = `${request.protocol}//${auth}${request.hostname}${port ? `:${port}` : ""}${path}`;
        const body = method === "GET" || method === "HEAD" ? undefined : request.body;
        const requestOptions = {
            body,
            headers: new Headers(request.headers),
            method: method,
            credentials,
        };
        if (this.config?.cache) {
            requestOptions.cache = this.config.cache;
        }
        if (body) {
            requestOptions.duplex = "half";
        }
        if (typeof AbortController !== "undefined") {
            requestOptions.signal = abortSignal;
        }
        if (keepAliveSupport.supported) {
            requestOptions.keepalive = keepAlive;
        }
        if (typeof this.config.requestInit === "function") {
            Object.assign(requestOptions, this.config.requestInit(request));
        }
        let removeSignalEventListener = () => { };
        const fetchRequest = createRequest(url, requestOptions);
        const raceOfPromises = [
            fetch(fetchRequest).then((response) => {
                const fetchHeaders = response.headers;
                const transformedHeaders = {};
                for (const pair of fetchHeaders.entries()) {
                    transformedHeaders[pair[0]] = pair[1];
                }
                const hasReadableStream = response.body != undefined;
                if (!hasReadableStream) {
                    return response.blob().then((body) => ({
                        response: new protocolHttp.HttpResponse({
                            headers: transformedHeaders,
                            reason: response.statusText,
                            statusCode: response.status,
                            body,
                        }),
                    }));
                }
                return {
                    response: new protocolHttp.HttpResponse({
                        headers: transformedHeaders,
                        reason: response.statusText,
                        statusCode: response.status,
                        body: response.body,
                    }),
                };
            }),
            requestTimeout(requestTimeoutInMs),
        ];
        if (abortSignal) {
            raceOfPromises.push(new Promise((resolve, reject) => {
                const onAbort = () => {
                    const abortError = new Error("Request aborted");
                    abortError.name = "AbortError";
                    reject(abortError);
                };
                if (typeof abortSignal.addEventListener === "function") {
                    const signal = abortSignal;
                    signal.addEventListener("abort", onAbort, { once: true });
                    removeSignalEventListener = () => signal.removeEventListener("abort", onAbort);
                }
                else {
                    abortSignal.onabort = onAbort;
                }
            }));
        }
        return Promise.race(raceOfPromises).finally(removeSignalEventListener);
    }
    updateHttpClientConfig(key, value) {
        this.config = undefined;
        this.configProvider = this.configProvider.then((config) => {
            config[key] = value;
            return config;
        });
    }
    httpHandlerConfigs() {
        return this.config ?? {};
    }
}

const streamCollector = async (stream) => {
    if ((typeof Blob === "function" && stream instanceof Blob) || stream.constructor?.name === "Blob") {
        if (Blob.prototype.arrayBuffer !== undefined) {
            return new Uint8Array(await stream.arrayBuffer());
        }
        return collectBlob(stream);
    }
    return collectStream(stream);
};
async function collectBlob(blob) {
    const base64 = await readToBase64(blob);
    const arrayBuffer = utilBase64.fromBase64(base64);
    return new Uint8Array(arrayBuffer);
}
async function collectStream(stream) {
    const chunks = [];
    const reader = stream.getReader();
    let isDone = false;
    let length = 0;
    while (!isDone) {
        const { done, value } = await reader.read();
        if (value) {
            chunks.push(value);
            length += value.length;
        }
        isDone = done;
    }
    const collected = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
        collected.set(chunk, offset);
        offset += chunk.length;
    }
    return collected;
}
function readToBase64(blob) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            if (reader.readyState !== 2) {
                return reject(new Error("Reader aborted too early"));
            }
            const result = (reader.result ?? "");
            const commaIndex = result.indexOf(",");
            const dataOffset = commaIndex > -1 ? commaIndex + 1 : result.length;
            resolve(result.substring(dataOffset));
        };
        reader.onabort = () => reject(new Error("Read aborted"));
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(blob);
    });
}

exports.FetchHttpHandler = FetchHttpHandler;
exports.keepAliveSupport = keepAliveSupport;
exports.streamCollector = streamCollector;


/***/ }),

/***/ 21109:
/***/ ((__unused_webpack_module, exports) => {



const isArrayBuffer = (arg) => (typeof ArrayBuffer === "function" && arg instanceof ArrayBuffer) ||
    Object.prototype.toString.call(arg) === "[object ArrayBuffer]";

exports.isArrayBuffer = isArrayBuffer;


/***/ }),

/***/ 14272:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getEndpointFromConfig = void 0;
const node_config_provider_1 = __webpack_require__(62021);
const getEndpointUrlConfig_1 = __webpack_require__(53219);
const getEndpointFromConfig = async (serviceId) => (0, node_config_provider_1.loadConfig)((0, getEndpointUrlConfig_1.getEndpointUrlConfig)(serviceId ?? ""))();
exports.getEndpointFromConfig = getEndpointFromConfig;


/***/ }),

/***/ 53219:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getEndpointUrlConfig = void 0;
const shared_ini_file_loader_1 = __webpack_require__(30489);
const ENV_ENDPOINT_URL = "AWS_ENDPOINT_URL";
const CONFIG_ENDPOINT_URL = "endpoint_url";
const getEndpointUrlConfig = (serviceId) => ({
    environmentVariableSelector: (env) => {
        const serviceSuffixParts = serviceId.split(" ").map((w) => w.toUpperCase());
        const serviceEndpointUrl = env[[ENV_ENDPOINT_URL, ...serviceSuffixParts].join("_")];
        if (serviceEndpointUrl)
            return serviceEndpointUrl;
        const endpointUrl = env[ENV_ENDPOINT_URL];
        if (endpointUrl)
            return endpointUrl;
        return undefined;
    },
    configFileSelector: (profile, config) => {
        if (config && profile.services) {
            const servicesSection = config[["services", profile.services].join(shared_ini_file_loader_1.CONFIG_PREFIX_SEPARATOR)];
            if (servicesSection) {
                const servicePrefixParts = serviceId.split(" ").map((w) => w.toLowerCase());
                const endpointUrl = servicesSection[[servicePrefixParts.join("_"), CONFIG_ENDPOINT_URL].join(shared_ini_file_loader_1.CONFIG_PREFIX_SEPARATOR)];
                if (endpointUrl)
                    return endpointUrl;
            }
        }
        const endpointUrl = profile[CONFIG_ENDPOINT_URL];
        if (endpointUrl)
            return endpointUrl;
        return undefined;
    },
    default: undefined,
});
exports.getEndpointUrlConfig = getEndpointUrlConfig;


/***/ }),

/***/ 42628:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {



var getEndpointFromConfig = __webpack_require__(14272);
var urlParser = __webpack_require__(60043);
var core = __webpack_require__(22743);
var utilMiddleware = __webpack_require__(99755);
var middlewareSerde = __webpack_require__(62654);

const resolveParamsForS3 = async (endpointParams) => {
    const bucket = endpointParams?.Bucket || "";
    if (typeof endpointParams.Bucket === "string") {
        endpointParams.Bucket = bucket.replace(/#/g, encodeURIComponent("#")).replace(/\?/g, encodeURIComponent("?"));
    }
    if (isArnBucketName(bucket)) {
        if (endpointParams.ForcePathStyle === true) {
            throw new Error("Path-style addressing cannot be used with ARN buckets");
        }
    }
    else if (!isDnsCompatibleBucketName(bucket) ||
        (bucket.indexOf(".") !== -1 && !String(endpointParams.Endpoint).startsWith("http:")) ||
        bucket.toLowerCase() !== bucket ||
        bucket.length < 3) {
        endpointParams.ForcePathStyle = true;
    }
    if (endpointParams.DisableMultiRegionAccessPoints) {
        endpointParams.disableMultiRegionAccessPoints = true;
        endpointParams.DisableMRAP = true;
    }
    return endpointParams;
};
const DOMAIN_PATTERN = /^[a-z0-9][a-z0-9\.\-]{1,61}[a-z0-9]$/;
const IP_ADDRESS_PATTERN = /(\d+\.){3}\d+/;
const DOTS_PATTERN = /\.\./;
const isDnsCompatibleBucketName = (bucketName) => DOMAIN_PATTERN.test(bucketName) && !IP_ADDRESS_PATTERN.test(bucketName) && !DOTS_PATTERN.test(bucketName);
const isArnBucketName = (bucketName) => {
    const [arn, partition, service, , , bucket] = bucketName.split(":");
    const isArn = arn === "arn" && bucketName.split(":").length >= 6;
    const isValidArn = Boolean(isArn && partition && service && bucket);
    if (isArn && !isValidArn) {
        throw new Error(`Invalid ARN: ${bucketName} was an invalid ARN.`);
    }
    return isValidArn;
};

const createConfigValueProvider = (configKey, canonicalEndpointParamKey, config) => {
    const configProvider = async () => {
        const configValue = config[configKey] ?? config[canonicalEndpointParamKey];
        if (typeof configValue === "function") {
            return configValue();
        }
        return configValue;
    };
    if (configKey === "credentialScope" || canonicalEndpointParamKey === "CredentialScope") {
        return async () => {
            const credentials = typeof config.credentials === "function" ? await config.credentials() : config.credentials;
            const configValue = credentials?.credentialScope ?? credentials?.CredentialScope;
            return configValue;
        };
    }
    if (configKey === "accountId" || canonicalEndpointParamKey === "AccountId") {
        return async () => {
            const credentials = typeof config.credentials === "function" ? await config.credentials() : config.credentials;
            const configValue = credentials?.accountId ?? credentials?.AccountId;
            return configValue;
        };
    }
    if (configKey === "endpoint" || canonicalEndpointParamKey === "endpoint") {
        return async () => {
            if (config.isCustomEndpoint === false) {
                return undefined;
            }
            const endpoint = await configProvider();
            if (endpoint && typeof endpoint === "object") {
                if ("url" in endpoint) {
                    return endpoint.url.href;
                }
                if ("hostname" in endpoint) {
                    const { protocol, hostname, port, path } = endpoint;
                    return `${protocol}//${hostname}${port ? ":" + port : ""}${path}`;
                }
            }
            return endpoint;
        };
    }
    return configProvider;
};

const toEndpointV1 = (endpoint) => {
    if (typeof endpoint === "object") {
        if ("url" in endpoint) {
            return urlParser.parseUrl(endpoint.url);
        }
        return endpoint;
    }
    return urlParser.parseUrl(endpoint);
};

const getEndpointFromInstructions = async (commandInput, instructionsSupplier, clientConfig, context) => {
    if (!clientConfig.isCustomEndpoint) {
        let endpointFromConfig;
        if (clientConfig.serviceConfiguredEndpoint) {
            endpointFromConfig = await clientConfig.serviceConfiguredEndpoint();
        }
        else {
            endpointFromConfig = await getEndpointFromConfig.getEndpointFromConfig(clientConfig.serviceId);
        }
        if (endpointFromConfig) {
            clientConfig.endpoint = () => Promise.resolve(toEndpointV1(endpointFromConfig));
            clientConfig.isCustomEndpoint = true;
        }
    }
    const endpointParams = await resolveParams(commandInput, instructionsSupplier, clientConfig);
    if (typeof clientConfig.endpointProvider !== "function") {
        throw new Error("config.endpointProvider is not set.");
    }
    const endpoint = clientConfig.endpointProvider(endpointParams, context);
    return endpoint;
};
const resolveParams = async (commandInput, instructionsSupplier, clientConfig) => {
    const endpointParams = {};
    const instructions = instructionsSupplier?.getEndpointParameterInstructions?.() || {};
    for (const [name, instruction] of Object.entries(instructions)) {
        switch (instruction.type) {
            case "staticContextParams":
                endpointParams[name] = instruction.value;
                break;
            case "contextParams":
                endpointParams[name] = commandInput[instruction.name];
                break;
            case "clientContextParams":
            case "builtInParams":
                endpointParams[name] = await createConfigValueProvider(instruction.name, name, clientConfig)();
                break;
            case "operationContextParams":
                endpointParams[name] = instruction.get(commandInput);
                break;
            default:
                throw new Error("Unrecognized endpoint parameter instruction: " + JSON.stringify(instruction));
        }
    }
    if (Object.keys(instructions).length === 0) {
        Object.assign(endpointParams, clientConfig);
    }
    if (String(clientConfig.serviceId).toLowerCase() === "s3") {
        await resolveParamsForS3(endpointParams);
    }
    return endpointParams;
};

const endpointMiddleware = ({ config, instructions, }) => {
    return (next, context) => async (args) => {
        if (config.isCustomEndpoint) {
            core.setFeature(context, "ENDPOINT_OVERRIDE", "N");
        }
        const endpoint = await getEndpointFromInstructions(args.input, {
            getEndpointParameterInstructions() {
                return instructions;
            },
        }, { ...config }, context);
        context.endpointV2 = endpoint;
        context.authSchemes = endpoint.properties?.authSchemes;
        const authScheme = context.authSchemes?.[0];
        if (authScheme) {
            context["signing_region"] = authScheme.signingRegion;
            context["signing_service"] = authScheme.signingName;
            const smithyContext = utilMiddleware.getSmithyContext(context);
            const httpAuthOption = smithyContext?.selectedHttpAuthScheme?.httpAuthOption;
            if (httpAuthOption) {
                httpAuthOption.signingProperties = Object.assign(httpAuthOption.signingProperties || {}, {
                    signing_region: authScheme.signingRegion,
                    signingRegion: authScheme.signingRegion,
                    signing_service: authScheme.signingName,
                    signingName: authScheme.signingName,
                    signingRegionSet: authScheme.signingRegionSet,
                }, authScheme.properties);
            }
        }
        return next({
            ...args,
        });
    };
};

const endpointMiddlewareOptions = {
    step: "serialize",
    tags: ["ENDPOINT_PARAMETERS", "ENDPOINT_V2", "ENDPOINT"],
    name: "endpointV2Middleware",
    override: true,
    relation: "before",
    toMiddleware: middlewareSerde.serializerMiddlewareOption.name,
};
const getEndpointPlugin = (config, instructions) => ({
    applyToStack: (clientStack) => {
        clientStack.addRelativeTo(endpointMiddleware({
            config,
            instructions,
        }), endpointMiddlewareOptions);
    },
});

const resolveEndpointConfig = (input) => {
    const tls = input.tls ?? true;
    const { endpoint, useDualstackEndpoint, useFipsEndpoint } = input;
    const customEndpointProvider = endpoint != null ? async () => toEndpointV1(await utilMiddleware.normalizeProvider(endpoint)()) : undefined;
    const isCustomEndpoint = !!endpoint;
    const resolvedConfig = Object.assign(input, {
        endpoint: customEndpointProvider,
        tls,
        isCustomEndpoint,
        useDualstackEndpoint: utilMiddleware.normalizeProvider(useDualstackEndpoint ?? false),
        useFipsEndpoint: utilMiddleware.normalizeProvider(useFipsEndpoint ?? false),
    });
    let configuredEndpointPromise = undefined;
    resolvedConfig.serviceConfiguredEndpoint = async () => {
        if (input.serviceId && !configuredEndpointPromise) {
            configuredEndpointPromise = getEndpointFromConfig.getEndpointFromConfig(input.serviceId);
        }
        return configuredEndpointPromise;
    };
    return resolvedConfig;
};

const resolveEndpointRequiredConfig = (input) => {
    const { endpoint } = input;
    if (endpoint === undefined) {
        input.endpoint = async () => {
            throw new Error("@smithy/middleware-endpoint: (default endpointRuleSet) endpoint is not set - you must configure an endpoint.");
        };
    }
    return input;
};

exports.endpointMiddleware = endpointMiddleware;
exports.endpointMiddlewareOptions = endpointMiddlewareOptions;
exports.getEndpointFromInstructions = getEndpointFromInstructions;
exports.getEndpointPlugin = getEndpointPlugin;
exports.resolveEndpointConfig = resolveEndpointConfig;
exports.resolveEndpointRequiredConfig = resolveEndpointRequiredConfig;
exports.resolveParams = resolveParams;
exports.toEndpointV1 = toEndpointV1;


/***/ }),

/***/ 62654:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {



var protocolHttp = __webpack_require__(20843);

const deserializerMiddleware = (options, deserializer) => (next, context) => async (args) => {
    const { response } = await next(args);
    try {
        const parsed = await deserializer(response, options);
        return {
            response,
            output: parsed,
        };
    }
    catch (error) {
        Object.defineProperty(error, "$response", {
            value: response,
        });
        if (!("$metadata" in error)) {
            const hint = `Deserialization error: to see the raw response, inspect the hidden field {error}.$response on this object.`;
            try {
                error.message += "\n  " + hint;
            }
            catch (e) {
                if (!context.logger || context.logger?.constructor?.name === "NoOpLogger") {
                    console.warn(hint);
                }
                else {
                    context.logger?.warn?.(hint);
                }
            }
            if (typeof error.$responseBodyText !== "undefined") {
                if (error.$response) {
                    error.$response.body = error.$responseBodyText;
                }
            }
            try {
                if (protocolHttp.HttpResponse.isInstance(response)) {
                    const { headers = {} } = response;
                    const headerEntries = Object.entries(headers);
                    error.$metadata = {
                        httpStatusCode: response.statusCode,
                        requestId: findHeader(/^x-[\w-]+-request-?id$/, headerEntries),
                        extendedRequestId: findHeader(/^x-[\w-]+-id-2$/, headerEntries),
                        cfId: findHeader(/^x-[\w-]+-cf-id$/, headerEntries),
                    };
                }
            }
            catch (e) {
            }
        }
        throw error;
    }
};
const findHeader = (pattern, headers) => {
    return (headers.find(([k]) => {
        return k.match(pattern);
    }) || [void 0, void 0])[1];
};

const serializerMiddleware = (options, serializer) => (next, context) => async (args) => {
    const endpointConfig = options;
    const endpoint = context.endpointV2?.url && endpointConfig.urlParser
        ? async () => endpointConfig.urlParser(context.endpointV2.url)
        : endpointConfig.endpoint;
    if (!endpoint) {
        throw new Error("No valid endpoint provider available.");
    }
    const request = await serializer(args.input, { ...options, endpoint });
    return next({
        ...args,
        request,
    });
};

const deserializerMiddlewareOption = {
    name: "deserializerMiddleware",
    step: "deserialize",
    tags: ["DESERIALIZER"],
    override: true,
};
const serializerMiddlewareOption = {
    name: "serializerMiddleware",
    step: "serialize",
    tags: ["SERIALIZER"],
    override: true,
};
function getSerdePlugin(config, serializer, deserializer) {
    return {
        applyToStack: (commandStack) => {
            commandStack.add(deserializerMiddleware(config, deserializer), deserializerMiddlewareOption);
            commandStack.add(serializerMiddleware(config, serializer), serializerMiddlewareOption);
        },
    };
}

exports.deserializerMiddleware = deserializerMiddleware;
exports.deserializerMiddlewareOption = deserializerMiddlewareOption;
exports.getSerdePlugin = getSerdePlugin;
exports.serializerMiddleware = serializerMiddleware;
exports.serializerMiddlewareOption = serializerMiddlewareOption;


/***/ }),

/***/ 62021:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {



var propertyProvider = __webpack_require__(64181);
var sharedIniFileLoader = __webpack_require__(30489);

function getSelectorName(functionString) {
    try {
        const constants = new Set(Array.from(functionString.match(/([A-Z_]){3,}/g) ?? []));
        constants.delete("CONFIG");
        constants.delete("CONFIG_PREFIX_SEPARATOR");
        constants.delete("ENV");
        return [...constants].join(", ");
    }
    catch (e) {
        return functionString;
    }
}

const fromEnv = (envVarSelector, options) => async () => {
    try {
        const config = envVarSelector(process.env, options);
        if (config === undefined) {
            throw new Error();
        }
        return config;
    }
    catch (e) {
        throw new propertyProvider.CredentialsProviderError(e.message || `Not found in ENV: ${getSelectorName(envVarSelector.toString())}`, { logger: options?.logger });
    }
};

const fromSharedConfigFiles = (configSelector, { preferredFile = "config", ...init } = {}) => async () => {
    const profile = sharedIniFileLoader.getProfileName(init);
    const { configFile, credentialsFile } = await sharedIniFileLoader.loadSharedConfigFiles(init);
    const profileFromCredentials = credentialsFile[profile] || {};
    const profileFromConfig = configFile[profile] || {};
    const mergedProfile = preferredFile === "config"
        ? { ...profileFromCredentials, ...profileFromConfig }
        : { ...profileFromConfig, ...profileFromCredentials };
    try {
        const cfgFile = preferredFile === "config" ? configFile : credentialsFile;
        const configValue = configSelector(mergedProfile, cfgFile);
        if (configValue === undefined) {
            throw new Error();
        }
        return configValue;
    }
    catch (e) {
        throw new propertyProvider.CredentialsProviderError(e.message || `Not found in config files w/ profile [${profile}]: ${getSelectorName(configSelector.toString())}`, { logger: init.logger });
    }
};

const isFunction = (func) => typeof func === "function";
const fromStatic = (defaultValue) => isFunction(defaultValue) ? async () => await defaultValue() : propertyProvider.fromStatic(defaultValue);

const loadConfig = ({ environmentVariableSelector, configFileSelector, default: defaultValue }, configuration = {}) => {
    const { signingName, logger } = configuration;
    const envOptions = { signingName, logger };
    return propertyProvider.memoize(propertyProvider.chain(fromEnv(environmentVariableSelector, envOptions), fromSharedConfigFiles(configFileSelector, configuration), fromStatic(defaultValue)));
};

exports.loadConfig = loadConfig;


/***/ }),

/***/ 82764:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {



var protocolHttp = __webpack_require__(20843);
var querystringBuilder = __webpack_require__(14959);
var http = __webpack_require__(58611);
var https = __webpack_require__(65692);
var stream = __webpack_require__(2203);
var http2 = __webpack_require__(85675);

const NODEJS_TIMEOUT_ERROR_CODES = ["ECONNRESET", "EPIPE", "ETIMEDOUT"];

const getTransformedHeaders = (headers) => {
    const transformedHeaders = {};
    for (const name of Object.keys(headers)) {
        const headerValues = headers[name];
        transformedHeaders[name] = Array.isArray(headerValues) ? headerValues.join(",") : headerValues;
    }
    return transformedHeaders;
};

const timing = {
    setTimeout: (cb, ms) => setTimeout(cb, ms),
    clearTimeout: (timeoutId) => clearTimeout(timeoutId),
};

const DEFER_EVENT_LISTENER_TIME$2 = 1000;
const setConnectionTimeout = (request, reject, timeoutInMs = 0) => {
    if (!timeoutInMs) {
        return -1;
    }
    const registerTimeout = (offset) => {
        const timeoutId = timing.setTimeout(() => {
            request.destroy();
            reject(Object.assign(new Error(`@smithy/node-http-handler - the request socket did not establish a connection with the server within the configured timeout of ${timeoutInMs} ms.`), {
                name: "TimeoutError",
            }));
        }, timeoutInMs - offset);
        const doWithSocket = (socket) => {
            if (socket?.connecting) {
                socket.on("connect", () => {
                    timing.clearTimeout(timeoutId);
                });
            }
            else {
                timing.clearTimeout(timeoutId);
            }
        };
        if (request.socket) {
            doWithSocket(request.socket);
        }
        else {
            request.on("socket", doWithSocket);
        }
    };
    if (timeoutInMs < 2000) {
        registerTimeout(0);
        return 0;
    }
    return timing.setTimeout(registerTimeout.bind(null, DEFER_EVENT_LISTENER_TIME$2), DEFER_EVENT_LISTENER_TIME$2);
};

const setRequestTimeout = (req, reject, timeoutInMs = 0, throwOnRequestTimeout, logger) => {
    if (timeoutInMs) {
        return timing.setTimeout(() => {
            let msg = `@smithy/node-http-handler - [${throwOnRequestTimeout ? "ERROR" : "WARN"}] a request has exceeded the configured ${timeoutInMs} ms requestTimeout.`;
            if (throwOnRequestTimeout) {
                const error = Object.assign(new Error(msg), {
                    name: "TimeoutError",
                    code: "ETIMEDOUT",
                });
                req.destroy(error);
                reject(error);
            }
            else {
                msg += ` Init client requestHandler with throwOnRequestTimeout=true to turn this into an error.`;
                logger?.warn?.(msg);
            }
        }, timeoutInMs);
    }
    return -1;
};

const DEFER_EVENT_LISTENER_TIME$1 = 3000;
const setSocketKeepAlive = (request, { keepAlive, keepAliveMsecs }, deferTimeMs = DEFER_EVENT_LISTENER_TIME$1) => {
    if (keepAlive !== true) {
        return -1;
    }
    const registerListener = () => {
        if (request.socket) {
            request.socket.setKeepAlive(keepAlive, keepAliveMsecs || 0);
        }
        else {
            request.on("socket", (socket) => {
                socket.setKeepAlive(keepAlive, keepAliveMsecs || 0);
            });
        }
    };
    if (deferTimeMs === 0) {
        registerListener();
        return 0;
    }
    return timing.setTimeout(registerListener, deferTimeMs);
};

const DEFER_EVENT_LISTENER_TIME = 3000;
const setSocketTimeout = (request, reject, timeoutInMs = 0) => {
    const registerTimeout = (offset) => {
        const timeout = timeoutInMs - offset;
        const onTimeout = () => {
            request.destroy();
            reject(Object.assign(new Error(`@smithy/node-http-handler - the request socket timed out after ${timeoutInMs} ms of inactivity (configured by client requestHandler).`), { name: "TimeoutError" }));
        };
        if (request.socket) {
            request.socket.setTimeout(timeout, onTimeout);
            request.on("close", () => request.socket?.removeListener("timeout", onTimeout));
        }
        else {
            request.setTimeout(timeout, onTimeout);
        }
    };
    if (0 < timeoutInMs && timeoutInMs < 6000) {
        registerTimeout(0);
        return 0;
    }
    return timing.setTimeout(registerTimeout.bind(null, timeoutInMs === 0 ? 0 : DEFER_EVENT_LISTENER_TIME), DEFER_EVENT_LISTENER_TIME);
};

const MIN_WAIT_TIME = 6_000;
async function writeRequestBody(httpRequest, request, maxContinueTimeoutMs = MIN_WAIT_TIME) {
    const headers = request.headers ?? {};
    const expect = headers["Expect"] || headers["expect"];
    let timeoutId = -1;
    let sendBody = true;
    if (expect === "100-continue") {
        sendBody = await Promise.race([
            new Promise((resolve) => {
                timeoutId = Number(timing.setTimeout(() => resolve(true), Math.max(MIN_WAIT_TIME, maxContinueTimeoutMs)));
            }),
            new Promise((resolve) => {
                httpRequest.on("continue", () => {
                    timing.clearTimeout(timeoutId);
                    resolve(true);
                });
                httpRequest.on("response", () => {
                    timing.clearTimeout(timeoutId);
                    resolve(false);
                });
                httpRequest.on("error", () => {
                    timing.clearTimeout(timeoutId);
                    resolve(false);
                });
            }),
        ]);
    }
    if (sendBody) {
        writeBody(httpRequest, request.body);
    }
}
function writeBody(httpRequest, body) {
    if (body instanceof stream.Readable) {
        body.pipe(httpRequest);
        return;
    }
    if (body) {
        if (Buffer.isBuffer(body) || typeof body === "string") {
            httpRequest.end(body);
            return;
        }
        const uint8 = body;
        if (typeof uint8 === "object" &&
            uint8.buffer &&
            typeof uint8.byteOffset === "number" &&
            typeof uint8.byteLength === "number") {
            httpRequest.end(Buffer.from(uint8.buffer, uint8.byteOffset, uint8.byteLength));
            return;
        }
        httpRequest.end(Buffer.from(body));
        return;
    }
    httpRequest.end();
}

const DEFAULT_REQUEST_TIMEOUT = 0;
class NodeHttpHandler {
    config;
    configProvider;
    socketWarningTimestamp = 0;
    metadata = { handlerProtocol: "http/1.1" };
    static create(instanceOrOptions) {
        if (typeof instanceOrOptions?.handle === "function") {
            return instanceOrOptions;
        }
        return new NodeHttpHandler(instanceOrOptions);
    }
    static checkSocketUsage(agent, socketWarningTimestamp, logger = console) {
        const { sockets, requests, maxSockets } = agent;
        if (typeof maxSockets !== "number" || maxSockets === Infinity) {
            return socketWarningTimestamp;
        }
        const interval = 15_000;
        if (Date.now() - interval < socketWarningTimestamp) {
            return socketWarningTimestamp;
        }
        if (sockets && requests) {
            for (const origin in sockets) {
                const socketsInUse = sockets[origin]?.length ?? 0;
                const requestsEnqueued = requests[origin]?.length ?? 0;
                if (socketsInUse >= maxSockets && requestsEnqueued >= 2 * maxSockets) {
                    logger?.warn?.(`@smithy/node-http-handler:WARN - socket usage at capacity=${socketsInUse} and ${requestsEnqueued} additional requests are enqueued.
See https://docs.aws.amazon.com/sdk-for-javascript/v3/developer-guide/node-configuring-maxsockets.html
or increase socketAcquisitionWarningTimeout=(millis) in the NodeHttpHandler config.`);
                    return Date.now();
                }
            }
        }
        return socketWarningTimestamp;
    }
    constructor(options) {
        this.configProvider = new Promise((resolve, reject) => {
            if (typeof options === "function") {
                options()
                    .then((_options) => {
                    resolve(this.resolveDefaultConfig(_options));
                })
                    .catch(reject);
            }
            else {
                resolve(this.resolveDefaultConfig(options));
            }
        });
    }
    resolveDefaultConfig(options) {
        const { requestTimeout, connectionTimeout, socketTimeout, socketAcquisitionWarningTimeout, httpAgent, httpsAgent, throwOnRequestTimeout, } = options || {};
        const keepAlive = true;
        const maxSockets = 50;
        return {
            connectionTimeout,
            requestTimeout,
            socketTimeout,
            socketAcquisitionWarningTimeout,
            throwOnRequestTimeout,
            httpAgent: (() => {
                if (httpAgent instanceof http.Agent || typeof httpAgent?.destroy === "function") {
                    return httpAgent;
                }
                return new http.Agent({ keepAlive, maxSockets, ...httpAgent });
            })(),
            httpsAgent: (() => {
                if (httpsAgent instanceof https.Agent || typeof httpsAgent?.destroy === "function") {
                    return httpsAgent;
                }
                return new https.Agent({ keepAlive, maxSockets, ...httpsAgent });
            })(),
            logger: console,
        };
    }
    destroy() {
        this.config?.httpAgent?.destroy();
        this.config?.httpsAgent?.destroy();
    }
    async handle(request, { abortSignal, requestTimeout } = {}) {
        if (!this.config) {
            this.config = await this.configProvider;
        }
        return new Promise((_resolve, _reject) => {
            let writeRequestBodyPromise = undefined;
            const timeouts = [];
            const resolve = async (arg) => {
                await writeRequestBodyPromise;
                timeouts.forEach(timing.clearTimeout);
                _resolve(arg);
            };
            const reject = async (arg) => {
                await writeRequestBodyPromise;
                timeouts.forEach(timing.clearTimeout);
                _reject(arg);
            };
            if (!this.config) {
                throw new Error("Node HTTP request handler config is not resolved");
            }
            if (abortSignal?.aborted) {
                const abortError = new Error("Request aborted");
                abortError.name = "AbortError";
                reject(abortError);
                return;
            }
            const isSSL = request.protocol === "https:";
            const agent = isSSL ? this.config.httpsAgent : this.config.httpAgent;
            timeouts.push(timing.setTimeout(() => {
                this.socketWarningTimestamp = NodeHttpHandler.checkSocketUsage(agent, this.socketWarningTimestamp, this.config.logger);
            }, this.config.socketAcquisitionWarningTimeout ??
                (this.config.requestTimeout ?? 2000) + (this.config.connectionTimeout ?? 1000)));
            const queryString = querystringBuilder.buildQueryString(request.query || {});
            let auth = undefined;
            if (request.username != null || request.password != null) {
                const username = request.username ?? "";
                const password = request.password ?? "";
                auth = `${username}:${password}`;
            }
            let path = request.path;
            if (queryString) {
                path += `?${queryString}`;
            }
            if (request.fragment) {
                path += `#${request.fragment}`;
            }
            let hostname = request.hostname ?? "";
            if (hostname[0] === "[" && hostname.endsWith("]")) {
                hostname = request.hostname.slice(1, -1);
            }
            else {
                hostname = request.hostname;
            }
            const nodeHttpsOptions = {
                headers: request.headers,
                host: hostname,
                method: request.method,
                path,
                port: request.port,
                agent,
                auth,
            };
            const requestFunc = isSSL ? https.request : http.request;
            const req = requestFunc(nodeHttpsOptions, (res) => {
                const httpResponse = new protocolHttp.HttpResponse({
                    statusCode: res.statusCode || -1,
                    reason: res.statusMessage,
                    headers: getTransformedHeaders(res.headers),
                    body: res,
                });
                resolve({ response: httpResponse });
            });
            req.on("error", (err) => {
                if (NODEJS_TIMEOUT_ERROR_CODES.includes(err.code)) {
                    reject(Object.assign(err, { name: "TimeoutError" }));
                }
                else {
                    reject(err);
                }
            });
            if (abortSignal) {
                const onAbort = () => {
                    req.destroy();
                    const abortError = new Error("Request aborted");
                    abortError.name = "AbortError";
                    reject(abortError);
                };
                if (typeof abortSignal.addEventListener === "function") {
                    const signal = abortSignal;
                    signal.addEventListener("abort", onAbort, { once: true });
                    req.once("close", () => signal.removeEventListener("abort", onAbort));
                }
                else {
                    abortSignal.onabort = onAbort;
                }
            }
            const effectiveRequestTimeout = requestTimeout ?? this.config.requestTimeout;
            timeouts.push(setConnectionTimeout(req, reject, this.config.connectionTimeout));
            timeouts.push(setRequestTimeout(req, reject, effectiveRequestTimeout, this.config.throwOnRequestTimeout, this.config.logger ?? console));
            timeouts.push(setSocketTimeout(req, reject, this.config.socketTimeout));
            const httpAgent = nodeHttpsOptions.agent;
            if (typeof httpAgent === "object" && "keepAlive" in httpAgent) {
                timeouts.push(setSocketKeepAlive(req, {
                    keepAlive: httpAgent.keepAlive,
                    keepAliveMsecs: httpAgent.keepAliveMsecs,
                }));
            }
            writeRequestBodyPromise = writeRequestBody(req, request, effectiveRequestTimeout).catch((e) => {
                timeouts.forEach(timing.clearTimeout);
                return _reject(e);
            });
        });
    }
    updateHttpClientConfig(key, value) {
        this.config = undefined;
        this.configProvider = this.configProvider.then((config) => {
            return {
                ...config,
                [key]: value,
            };
        });
    }
    httpHandlerConfigs() {
        return this.config ?? {};
    }
}

class NodeHttp2ConnectionPool {
    sessions = [];
    constructor(sessions) {
        this.sessions = sessions ?? [];
    }
    poll() {
        if (this.sessions.length > 0) {
            return this.sessions.shift();
        }
    }
    offerLast(session) {
        this.sessions.push(session);
    }
    contains(session) {
        return this.sessions.includes(session);
    }
    remove(session) {
        this.sessions = this.sessions.filter((s) => s !== session);
    }
    [Symbol.iterator]() {
        return this.sessions[Symbol.iterator]();
    }
    destroy(connection) {
        for (const session of this.sessions) {
            if (session === connection) {
                if (!session.destroyed) {
                    session.destroy();
                }
            }
        }
    }
}

class NodeHttp2ConnectionManager {
    constructor(config) {
        this.config = config;
        if (this.config.maxConcurrency && this.config.maxConcurrency <= 0) {
            throw new RangeError("maxConcurrency must be greater than zero.");
        }
    }
    config;
    sessionCache = new Map();
    lease(requestContext, connectionConfiguration) {
        const url = this.getUrlString(requestContext);
        const existingPool = this.sessionCache.get(url);
        if (existingPool) {
            const existingSession = existingPool.poll();
            if (existingSession && !this.config.disableConcurrency) {
                return existingSession;
            }
        }
        const session = http2.connect(url);
        if (this.config.maxConcurrency) {
            session.settings({ maxConcurrentStreams: this.config.maxConcurrency }, (err) => {
                if (err) {
                    throw new Error("Fail to set maxConcurrentStreams to " +
                        this.config.maxConcurrency +
                        "when creating new session for " +
                        requestContext.destination.toString());
                }
            });
        }
        session.unref();
        const destroySessionCb = () => {
            session.destroy();
            this.deleteSession(url, session);
        };
        session.on("goaway", destroySessionCb);
        session.on("error", destroySessionCb);
        session.on("frameError", destroySessionCb);
        session.on("close", () => this.deleteSession(url, session));
        if (connectionConfiguration.requestTimeout) {
            session.setTimeout(connectionConfiguration.requestTimeout, destroySessionCb);
        }
        const connectionPool = this.sessionCache.get(url) || new NodeHttp2ConnectionPool();
        connectionPool.offerLast(session);
        this.sessionCache.set(url, connectionPool);
        return session;
    }
    deleteSession(authority, session) {
        const existingConnectionPool = this.sessionCache.get(authority);
        if (!existingConnectionPool) {
            return;
        }
        if (!existingConnectionPool.contains(session)) {
            return;
        }
        existingConnectionPool.remove(session);
        this.sessionCache.set(authority, existingConnectionPool);
    }
    release(requestContext, session) {
        const cacheKey = this.getUrlString(requestContext);
        this.sessionCache.get(cacheKey)?.offerLast(session);
    }
    destroy() {
        for (const [key, connectionPool] of this.sessionCache) {
            for (const session of connectionPool) {
                if (!session.destroyed) {
                    session.destroy();
                }
                connectionPool.remove(session);
            }
            this.sessionCache.delete(key);
        }
    }
    setMaxConcurrentStreams(maxConcurrentStreams) {
        if (maxConcurrentStreams && maxConcurrentStreams <= 0) {
            throw new RangeError("maxConcurrentStreams must be greater than zero.");
        }
        this.config.maxConcurrency = maxConcurrentStreams;
    }
    setDisableConcurrentStreams(disableConcurrentStreams) {
        this.config.disableConcurrency = disableConcurrentStreams;
    }
    getUrlString(request) {
        return request.destination.toString();
    }
}

class NodeHttp2Handler {
    config;
    configProvider;
    metadata = { handlerProtocol: "h2" };
    connectionManager = new NodeHttp2ConnectionManager({});
    static create(instanceOrOptions) {
        if (typeof instanceOrOptions?.handle === "function") {
            return instanceOrOptions;
        }
        return new NodeHttp2Handler(instanceOrOptions);
    }
    constructor(options) {
        this.configProvider = new Promise((resolve, reject) => {
            if (typeof options === "function") {
                options()
                    .then((opts) => {
                    resolve(opts || {});
                })
                    .catch(reject);
            }
            else {
                resolve(options || {});
            }
        });
    }
    destroy() {
        this.connectionManager.destroy();
    }
    async handle(request, { abortSignal, requestTimeout } = {}) {
        if (!this.config) {
            this.config = await this.configProvider;
            this.connectionManager.setDisableConcurrentStreams(this.config.disableConcurrentStreams || false);
            if (this.config.maxConcurrentStreams) {
                this.connectionManager.setMaxConcurrentStreams(this.config.maxConcurrentStreams);
            }
        }
        const { requestTimeout: configRequestTimeout, disableConcurrentStreams } = this.config;
        const effectiveRequestTimeout = requestTimeout ?? configRequestTimeout;
        return new Promise((_resolve, _reject) => {
            let fulfilled = false;
            let writeRequestBodyPromise = undefined;
            const resolve = async (arg) => {
                await writeRequestBodyPromise;
                _resolve(arg);
            };
            const reject = async (arg) => {
                await writeRequestBodyPromise;
                _reject(arg);
            };
            if (abortSignal?.aborted) {
                fulfilled = true;
                const abortError = new Error("Request aborted");
                abortError.name = "AbortError";
                reject(abortError);
                return;
            }
            const { hostname, method, port, protocol, query } = request;
            let auth = "";
            if (request.username != null || request.password != null) {
                const username = request.username ?? "";
                const password = request.password ?? "";
                auth = `${username}:${password}@`;
            }
            const authority = `${protocol}//${auth}${hostname}${port ? `:${port}` : ""}`;
            const requestContext = { destination: new URL(authority) };
            const session = this.connectionManager.lease(requestContext, {
                requestTimeout: this.config?.sessionTimeout,
                disableConcurrentStreams: disableConcurrentStreams || false,
            });
            const rejectWithDestroy = (err) => {
                if (disableConcurrentStreams) {
                    this.destroySession(session);
                }
                fulfilled = true;
                reject(err);
            };
            const queryString = querystringBuilder.buildQueryString(query || {});
            let path = request.path;
            if (queryString) {
                path += `?${queryString}`;
            }
            if (request.fragment) {
                path += `#${request.fragment}`;
            }
            const req = session.request({
                ...request.headers,
                [http2.constants.HTTP2_HEADER_PATH]: path,
                [http2.constants.HTTP2_HEADER_METHOD]: method,
            });
            session.ref();
            req.on("response", (headers) => {
                const httpResponse = new protocolHttp.HttpResponse({
                    statusCode: headers[":status"] || -1,
                    headers: getTransformedHeaders(headers),
                    body: req,
                });
                fulfilled = true;
                resolve({ response: httpResponse });
                if (disableConcurrentStreams) {
                    session.close();
                    this.connectionManager.deleteSession(authority, session);
                }
            });
            if (effectiveRequestTimeout) {
                req.setTimeout(effectiveRequestTimeout, () => {
                    req.close();
                    const timeoutError = new Error(`Stream timed out because of no activity for ${effectiveRequestTimeout} ms`);
                    timeoutError.name = "TimeoutError";
                    rejectWithDestroy(timeoutError);
                });
            }
            if (abortSignal) {
                const onAbort = () => {
                    req.close();
                    const abortError = new Error("Request aborted");
                    abortError.name = "AbortError";
                    rejectWithDestroy(abortError);
                };
                if (typeof abortSignal.addEventListener === "function") {
                    const signal = abortSignal;
                    signal.addEventListener("abort", onAbort, { once: true });
                    req.once("close", () => signal.removeEventListener("abort", onAbort));
                }
                else {
                    abortSignal.onabort = onAbort;
                }
            }
            req.on("frameError", (type, code, id) => {
                rejectWithDestroy(new Error(`Frame type id ${type} in stream id ${id} has failed with code ${code}.`));
            });
            req.on("error", rejectWithDestroy);
            req.on("aborted", () => {
                rejectWithDestroy(new Error(`HTTP/2 stream is abnormally aborted in mid-communication with result code ${req.rstCode}.`));
            });
            req.on("close", () => {
                session.unref();
                if (disableConcurrentStreams) {
                    session.destroy();
                }
                if (!fulfilled) {
                    rejectWithDestroy(new Error("Unexpected error: http2 request did not get a response"));
                }
            });
            writeRequestBodyPromise = writeRequestBody(req, request, effectiveRequestTimeout);
        });
    }
    updateHttpClientConfig(key, value) {
        this.config = undefined;
        this.configProvider = this.configProvider.then((config) => {
            return {
                ...config,
                [key]: value,
            };
        });
    }
    httpHandlerConfigs() {
        return this.config ?? {};
    }
    destroySession(session) {
        if (!session.destroyed) {
            session.destroy();
        }
    }
}

class Collector extends stream.Writable {
    bufferedBytes = [];
    _write(chunk, encoding, callback) {
        this.bufferedBytes.push(chunk);
        callback();
    }
}

const streamCollector = (stream) => {
    if (isReadableStreamInstance(stream)) {
        return collectReadableStream(stream);
    }
    return new Promise((resolve, reject) => {
        const collector = new Collector();
        stream.pipe(collector);
        stream.on("error", (err) => {
            collector.end();
            reject(err);
        });
        collector.on("error", reject);
        collector.on("finish", function () {
            const bytes = new Uint8Array(Buffer.concat(this.bufferedBytes));
            resolve(bytes);
        });
    });
};
const isReadableStreamInstance = (stream) => typeof ReadableStream === "function" && stream instanceof ReadableStream;
async function collectReadableStream(stream) {
    const chunks = [];
    const reader = stream.getReader();
    let isDone = false;
    let length = 0;
    while (!isDone) {
        const { done, value } = await reader.read();
        if (value) {
            chunks.push(value);
            length += value.length;
        }
        isDone = done;
    }
    const collected = new Uint8Array(length);
    let offset = 0;
    for (const chunk of chunks) {
        collected.set(chunk, offset);
        offset += chunk.length;
    }
    return collected;
}

exports.DEFAULT_REQUEST_TIMEOUT = DEFAULT_REQUEST_TIMEOUT;
exports.NodeHttp2Handler = NodeHttp2Handler;
exports.NodeHttpHandler = NodeHttpHandler;
exports.streamCollector = streamCollector;


/***/ }),

/***/ 64181:
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

/***/ 20843:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {



var types = __webpack_require__(65165);

const getHttpHandlerExtensionConfiguration = (runtimeConfig) => {
    return {
        setHttpHandler(handler) {
            runtimeConfig.httpHandler = handler;
        },
        httpHandler() {
            return runtimeConfig.httpHandler;
        },
        updateHttpClientConfig(key, value) {
            runtimeConfig.httpHandler?.updateHttpClientConfig(key, value);
        },
        httpHandlerConfigs() {
            return runtimeConfig.httpHandler.httpHandlerConfigs();
        },
    };
};
const resolveHttpHandlerRuntimeConfig = (httpHandlerExtensionConfiguration) => {
    return {
        httpHandler: httpHandlerExtensionConfiguration.httpHandler(),
    };
};

class Field {
    name;
    kind;
    values;
    constructor({ name, kind = types.FieldPosition.HEADER, values = [] }) {
        this.name = name;
        this.kind = kind;
        this.values = values;
    }
    add(value) {
        this.values.push(value);
    }
    set(values) {
        this.values = values;
    }
    remove(value) {
        this.values = this.values.filter((v) => v !== value);
    }
    toString() {
        return this.values.map((v) => (v.includes(",") || v.includes(" ") ? `"${v}"` : v)).join(", ");
    }
    get() {
        return this.values;
    }
}

class Fields {
    entries = {};
    encoding;
    constructor({ fields = [], encoding = "utf-8" }) {
        fields.forEach(this.setField.bind(this));
        this.encoding = encoding;
    }
    setField(field) {
        this.entries[field.name.toLowerCase()] = field;
    }
    getField(name) {
        return this.entries[name.toLowerCase()];
    }
    removeField(name) {
        delete this.entries[name.toLowerCase()];
    }
    getByType(kind) {
        return Object.values(this.entries).filter((field) => field.kind === kind);
    }
}

class HttpRequest {
    method;
    protocol;
    hostname;
    port;
    path;
    query;
    headers;
    username;
    password;
    fragment;
    body;
    constructor(options) {
        this.method = options.method || "GET";
        this.hostname = options.hostname || "localhost";
        this.port = options.port;
        this.query = options.query || {};
        this.headers = options.headers || {};
        this.body = options.body;
        this.protocol = options.protocol
            ? options.protocol.slice(-1) !== ":"
                ? `${options.protocol}:`
                : options.protocol
            : "https:";
        this.path = options.path ? (options.path.charAt(0) !== "/" ? `/${options.path}` : options.path) : "/";
        this.username = options.username;
        this.password = options.password;
        this.fragment = options.fragment;
    }
    static clone(request) {
        const cloned = new HttpRequest({
            ...request,
            headers: { ...request.headers },
        });
        if (cloned.query) {
            cloned.query = cloneQuery(cloned.query);
        }
        return cloned;
    }
    static isInstance(request) {
        if (!request) {
            return false;
        }
        const req = request;
        return ("method" in req &&
            "protocol" in req &&
            "hostname" in req &&
            "path" in req &&
            typeof req["query"] === "object" &&
            typeof req["headers"] === "object");
    }
    clone() {
        return HttpRequest.clone(this);
    }
}
function cloneQuery(query) {
    return Object.keys(query).reduce((carry, paramName) => {
        const param = query[paramName];
        return {
            ...carry,
            [paramName]: Array.isArray(param) ? [...param] : param,
        };
    }, {});
}

class HttpResponse {
    statusCode;
    reason;
    headers;
    body;
    constructor(options) {
        this.statusCode = options.statusCode;
        this.reason = options.reason;
        this.headers = options.headers || {};
        this.body = options.body;
    }
    static isInstance(response) {
        if (!response)
            return false;
        const resp = response;
        return typeof resp.statusCode === "number" && typeof resp.headers === "object";
    }
}

function isValidHostname(hostname) {
    const hostPattern = /^[a-z0-9][a-z0-9\.\-]*[a-z0-9]$/;
    return hostPattern.test(hostname);
}

exports.Field = Field;
exports.Fields = Fields;
exports.HttpRequest = HttpRequest;
exports.HttpResponse = HttpResponse;
exports.getHttpHandlerExtensionConfiguration = getHttpHandlerExtensionConfiguration;
exports.isValidHostname = isValidHostname;
exports.resolveHttpHandlerRuntimeConfig = resolveHttpHandlerRuntimeConfig;


/***/ }),

/***/ 14959:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {



var utilUriEscape = __webpack_require__(87377);

function buildQueryString(query) {
    const parts = [];
    for (let key of Object.keys(query).sort()) {
        const value = query[key];
        key = utilUriEscape.escapeUri(key);
        if (Array.isArray(value)) {
            for (let i = 0, iLen = value.length; i < iLen; i++) {
                parts.push(`${key}=${utilUriEscape.escapeUri(value[i])}`);
            }
        }
        else {
            let qsEntry = key;
            if (value || typeof value === "string") {
                qsEntry += `=${utilUriEscape.escapeUri(value)}`;
            }
            parts.push(qsEntry);
        }
    }
    return parts.join("&");
}

exports.buildQueryString = buildQueryString;


/***/ }),

/***/ 15183:
/***/ ((__unused_webpack_module, exports) => {



function parseQueryString(querystring) {
    const query = {};
    querystring = querystring.replace(/^\?/, "");
    if (querystring) {
        for (const pair of querystring.split("&")) {
            let [key, value = null] = pair.split("=");
            key = decodeURIComponent(key);
            if (value) {
                value = decodeURIComponent(value);
            }
            if (!(key in query)) {
                query[key] = value;
            }
            else if (Array.isArray(query[key])) {
                query[key].push(value);
            }
            else {
                query[key] = [query[key], value];
            }
        }
    }
    return query;
}

exports.parseQueryString = parseQueryString;


/***/ }),

/***/ 23327:
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

/***/ 72412:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getSSOTokenFilepath = void 0;
const crypto_1 = __webpack_require__(76982);
const path_1 = __webpack_require__(16928);
const getHomeDir_1 = __webpack_require__(23327);
const getSSOTokenFilepath = (id) => {
    const hasher = (0, crypto_1.createHash)("sha1");
    const cacheName = hasher.update(id).digest("hex");
    return (0, path_1.join)((0, getHomeDir_1.getHomeDir)(), ".aws", "sso", "cache", `${cacheName}.json`);
};
exports.getSSOTokenFilepath = getSSOTokenFilepath;


/***/ }),

/***/ 27539:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getSSOTokenFromFile = exports.tokenIntercept = void 0;
const fs_1 = __webpack_require__(79896);
const getSSOTokenFilepath_1 = __webpack_require__(72412);
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

/***/ 30489:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {



var getHomeDir = __webpack_require__(23327);
var getSSOTokenFilepath = __webpack_require__(72412);
var getSSOTokenFromFile = __webpack_require__(27539);
var path = __webpack_require__(16928);
var types = __webpack_require__(65165);
var slurpFile = __webpack_require__(47307);

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

/***/ 47307:
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

/***/ 65165:
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


/***/ }),

/***/ 60043:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {



var querystringParser = __webpack_require__(15183);

const parseUrl = (url) => {
    if (typeof url === "string") {
        return parseUrl(new URL(url));
    }
    const { hostname, pathname, port, protocol, search } = url;
    let query;
    if (search) {
        query = querystringParser.parseQueryString(search);
    }
    return {
        hostname,
        port: port ? parseInt(port) : undefined,
        protocol,
        path: pathname,
        query,
    };
};

exports.parseUrl = parseUrl;


/***/ }),

/***/ 95895:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.fromBase64 = void 0;
const util_buffer_from_1 = __webpack_require__(21266);
const BASE64_REGEX = /^[A-Za-z0-9+/]*={0,2}$/;
const fromBase64 = (input) => {
    if ((input.length * 3) % 4 !== 0) {
        throw new TypeError(`Incorrect padding on base64 string.`);
    }
    if (!BASE64_REGEX.exec(input)) {
        throw new TypeError(`Invalid base64 string.`);
    }
    const buffer = (0, util_buffer_from_1.fromString)(input, "base64");
    return new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
};
exports.fromBase64 = fromBase64;


/***/ }),

/***/ 72722:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {



var fromBase64 = __webpack_require__(95895);
var toBase64 = __webpack_require__(97234);



Object.keys(fromBase64).forEach(function (k) {
	if (k !== 'default' && !Object.prototype.hasOwnProperty.call(exports, k)) Object.defineProperty(exports, k, {
		enumerable: true,
		get: function () { return fromBase64[k]; }
	});
});
Object.keys(toBase64).forEach(function (k) {
	if (k !== 'default' && !Object.prototype.hasOwnProperty.call(exports, k)) Object.defineProperty(exports, k, {
		enumerable: true,
		get: function () { return toBase64[k]; }
	});
});


/***/ }),

/***/ 97234:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.toBase64 = void 0;
const util_buffer_from_1 = __webpack_require__(21266);
const util_utf8_1 = __webpack_require__(46090);
const toBase64 = (_input) => {
    let input;
    if (typeof _input === "string") {
        input = (0, util_utf8_1.fromUtf8)(_input);
    }
    else {
        input = _input;
    }
    if (typeof input !== "object" || typeof input.byteOffset !== "number" || typeof input.byteLength !== "number") {
        throw new Error("@smithy/util-base64: toBase64 encoder function only accepts string | Uint8Array.");
    }
    return (0, util_buffer_from_1.fromArrayBuffer)(input.buffer, input.byteOffset, input.byteLength).toString("base64");
};
exports.toBase64 = toBase64;


/***/ }),

/***/ 21266:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {



var isArrayBuffer = __webpack_require__(21109);
var buffer = __webpack_require__(20181);

const fromArrayBuffer = (input, offset = 0, length = input.byteLength - offset) => {
    if (!isArrayBuffer.isArrayBuffer(input)) {
        throw new TypeError(`The "input" argument must be ArrayBuffer. Received type ${typeof input} (${input})`);
    }
    return buffer.Buffer.from(input, offset, length);
};
const fromString = (input, encoding) => {
    if (typeof input !== "string") {
        throw new TypeError(`The "input" argument must be of type string. Received type ${typeof input} (${input})`);
    }
    return encoding ? buffer.Buffer.from(input, encoding) : buffer.Buffer.from(input);
};

exports.fromArrayBuffer = fromArrayBuffer;
exports.fromString = fromString;


/***/ }),

/***/ 79916:
/***/ ((__unused_webpack_module, exports) => {



const SHORT_TO_HEX = {};
const HEX_TO_SHORT = {};
for (let i = 0; i < 256; i++) {
    let encodedByte = i.toString(16).toLowerCase();
    if (encodedByte.length === 1) {
        encodedByte = `0${encodedByte}`;
    }
    SHORT_TO_HEX[i] = encodedByte;
    HEX_TO_SHORT[encodedByte] = i;
}
function fromHex(encoded) {
    if (encoded.length % 2 !== 0) {
        throw new Error("Hex encoded strings must have an even number length");
    }
    const out = new Uint8Array(encoded.length / 2);
    for (let i = 0; i < encoded.length; i += 2) {
        const encodedByte = encoded.slice(i, i + 2).toLowerCase();
        if (encodedByte in HEX_TO_SHORT) {
            out[i / 2] = HEX_TO_SHORT[encodedByte];
        }
        else {
            throw new Error(`Cannot decode unrecognized sequence ${encodedByte} as hexadecimal`);
        }
    }
    return out;
}
function toHex(bytes) {
    let out = "";
    for (let i = 0; i < bytes.byteLength; i++) {
        out += SHORT_TO_HEX[bytes[i]];
    }
    return out;
}

exports.fromHex = fromHex;
exports.toHex = toHex;


/***/ }),

/***/ 99755:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {



var types = __webpack_require__(65165);

const getSmithyContext = (context) => context[types.SMITHY_CONTEXT_KEY] || (context[types.SMITHY_CONTEXT_KEY] = {});

const normalizeProvider = (input) => {
    if (typeof input === "function")
        return input;
    const promisified = Promise.resolve(input);
    return () => promisified;
};

exports.getSmithyContext = getSmithyContext;
exports.normalizeProvider = normalizeProvider;


/***/ }),

/***/ 79241:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ByteArrayCollector = void 0;
class ByteArrayCollector {
    allocByteArray;
    byteLength = 0;
    byteArrays = [];
    constructor(allocByteArray) {
        this.allocByteArray = allocByteArray;
    }
    push(byteArray) {
        this.byteArrays.push(byteArray);
        this.byteLength += byteArray.byteLength;
    }
    flush() {
        if (this.byteArrays.length === 1) {
            const bytes = this.byteArrays[0];
            this.reset();
            return bytes;
        }
        const aggregation = this.allocByteArray(this.byteLength);
        let cursor = 0;
        for (let i = 0; i < this.byteArrays.length; ++i) {
            const bytes = this.byteArrays[i];
            aggregation.set(bytes, cursor);
            cursor += bytes.byteLength;
        }
        this.reset();
        return aggregation;
    }
    reset() {
        this.byteArrays = [];
        this.byteLength = 0;
    }
}
exports.ByteArrayCollector = ByteArrayCollector;


/***/ }),

/***/ 34778:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ChecksumStream = void 0;
const ReadableStreamRef = typeof ReadableStream === "function" ? ReadableStream : function () { };
class ChecksumStream extends ReadableStreamRef {
}
exports.ChecksumStream = ChecksumStream;


/***/ }),

/***/ 72116:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.ChecksumStream = void 0;
const util_base64_1 = __webpack_require__(72722);
const stream_1 = __webpack_require__(2203);
class ChecksumStream extends stream_1.Duplex {
    expectedChecksum;
    checksumSourceLocation;
    checksum;
    source;
    base64Encoder;
    constructor({ expectedChecksum, checksum, source, checksumSourceLocation, base64Encoder, }) {
        super();
        if (typeof source.pipe === "function") {
            this.source = source;
        }
        else {
            throw new Error(`@smithy/util-stream: unsupported source type ${source?.constructor?.name ?? source} in ChecksumStream.`);
        }
        this.base64Encoder = base64Encoder ?? util_base64_1.toBase64;
        this.expectedChecksum = expectedChecksum;
        this.checksum = checksum;
        this.checksumSourceLocation = checksumSourceLocation;
        this.source.pipe(this);
    }
    _read(size) { }
    _write(chunk, encoding, callback) {
        try {
            this.checksum.update(chunk);
            this.push(chunk);
        }
        catch (e) {
            return callback(e);
        }
        return callback();
    }
    async _final(callback) {
        try {
            const digest = await this.checksum.digest();
            const received = this.base64Encoder(digest);
            if (this.expectedChecksum !== received) {
                return callback(new Error(`Checksum mismatch: expected "${this.expectedChecksum}" but received "${received}"` +
                    ` in response header "${this.checksumSourceLocation}".`));
            }
        }
        catch (e) {
            return callback(e);
        }
        this.push(null);
        return callback();
    }
}
exports.ChecksumStream = ChecksumStream;


/***/ }),

/***/ 49158:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.createChecksumStream = void 0;
const util_base64_1 = __webpack_require__(72722);
const stream_type_check_1 = __webpack_require__(37785);
const ChecksumStream_browser_1 = __webpack_require__(34778);
const createChecksumStream = ({ expectedChecksum, checksum, source, checksumSourceLocation, base64Encoder, }) => {
    if (!(0, stream_type_check_1.isReadableStream)(source)) {
        throw new Error(`@smithy/util-stream: unsupported source type ${source?.constructor?.name ?? source} in ChecksumStream.`);
    }
    const encoder = base64Encoder ?? util_base64_1.toBase64;
    if (typeof TransformStream !== "function") {
        throw new Error("@smithy/util-stream: unable to instantiate ChecksumStream because API unavailable: ReadableStream/TransformStream.");
    }
    const transform = new TransformStream({
        start() { },
        async transform(chunk, controller) {
            checksum.update(chunk);
            controller.enqueue(chunk);
        },
        async flush(controller) {
            const digest = await checksum.digest();
            const received = encoder(digest);
            if (expectedChecksum !== received) {
                const error = new Error(`Checksum mismatch: expected "${expectedChecksum}" but received "${received}"` +
                    ` in response header "${checksumSourceLocation}".`);
                controller.error(error);
            }
            else {
                controller.terminate();
            }
        },
    });
    source.pipeThrough(transform);
    const readable = transform.readable;
    Object.setPrototypeOf(readable, ChecksumStream_browser_1.ChecksumStream.prototype);
    return readable;
};
exports.createChecksumStream = createChecksumStream;


/***/ }),

/***/ 32384:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.createChecksumStream = createChecksumStream;
const stream_type_check_1 = __webpack_require__(37785);
const ChecksumStream_1 = __webpack_require__(72116);
const createChecksumStream_browser_1 = __webpack_require__(49158);
function createChecksumStream(init) {
    if (typeof ReadableStream === "function" && (0, stream_type_check_1.isReadableStream)(init.source)) {
        return (0, createChecksumStream_browser_1.createChecksumStream)(init);
    }
    return new ChecksumStream_1.ChecksumStream(init);
}


/***/ }),

/***/ 40260:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.createBufferedReadable = createBufferedReadable;
const node_stream_1 = __webpack_require__(57075);
const ByteArrayCollector_1 = __webpack_require__(79241);
const createBufferedReadableStream_1 = __webpack_require__(34335);
const stream_type_check_1 = __webpack_require__(37785);
function createBufferedReadable(upstream, size, logger) {
    if ((0, stream_type_check_1.isReadableStream)(upstream)) {
        return (0, createBufferedReadableStream_1.createBufferedReadableStream)(upstream, size, logger);
    }
    const downstream = new node_stream_1.Readable({ read() { } });
    let streamBufferingLoggedWarning = false;
    let bytesSeen = 0;
    const buffers = [
        "",
        new ByteArrayCollector_1.ByteArrayCollector((size) => new Uint8Array(size)),
        new ByteArrayCollector_1.ByteArrayCollector((size) => Buffer.from(new Uint8Array(size))),
    ];
    let mode = -1;
    upstream.on("data", (chunk) => {
        const chunkMode = (0, createBufferedReadableStream_1.modeOf)(chunk, true);
        if (mode !== chunkMode) {
            if (mode >= 0) {
                downstream.push((0, createBufferedReadableStream_1.flush)(buffers, mode));
            }
            mode = chunkMode;
        }
        if (mode === -1) {
            downstream.push(chunk);
            return;
        }
        const chunkSize = (0, createBufferedReadableStream_1.sizeOf)(chunk);
        bytesSeen += chunkSize;
        const bufferSize = (0, createBufferedReadableStream_1.sizeOf)(buffers[mode]);
        if (chunkSize >= size && bufferSize === 0) {
            downstream.push(chunk);
        }
        else {
            const newSize = (0, createBufferedReadableStream_1.merge)(buffers, mode, chunk);
            if (!streamBufferingLoggedWarning && bytesSeen > size * 2) {
                streamBufferingLoggedWarning = true;
                logger?.warn(`@smithy/util-stream - stream chunk size ${chunkSize} is below threshold of ${size}, automatically buffering.`);
            }
            if (newSize >= size) {
                downstream.push((0, createBufferedReadableStream_1.flush)(buffers, mode));
            }
        }
    });
    upstream.on("end", () => {
        if (mode !== -1) {
            const remainder = (0, createBufferedReadableStream_1.flush)(buffers, mode);
            if ((0, createBufferedReadableStream_1.sizeOf)(remainder) > 0) {
                downstream.push(remainder);
            }
        }
        downstream.push(null);
    });
    return downstream;
}


/***/ }),

/***/ 34335:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.createBufferedReadable = void 0;
exports.createBufferedReadableStream = createBufferedReadableStream;
exports.merge = merge;
exports.flush = flush;
exports.sizeOf = sizeOf;
exports.modeOf = modeOf;
const ByteArrayCollector_1 = __webpack_require__(79241);
function createBufferedReadableStream(upstream, size, logger) {
    const reader = upstream.getReader();
    let streamBufferingLoggedWarning = false;
    let bytesSeen = 0;
    const buffers = ["", new ByteArrayCollector_1.ByteArrayCollector((size) => new Uint8Array(size))];
    let mode = -1;
    const pull = async (controller) => {
        const { value, done } = await reader.read();
        const chunk = value;
        if (done) {
            if (mode !== -1) {
                const remainder = flush(buffers, mode);
                if (sizeOf(remainder) > 0) {
                    controller.enqueue(remainder);
                }
            }
            controller.close();
        }
        else {
            const chunkMode = modeOf(chunk, false);
            if (mode !== chunkMode) {
                if (mode >= 0) {
                    controller.enqueue(flush(buffers, mode));
                }
                mode = chunkMode;
            }
            if (mode === -1) {
                controller.enqueue(chunk);
                return;
            }
            const chunkSize = sizeOf(chunk);
            bytesSeen += chunkSize;
            const bufferSize = sizeOf(buffers[mode]);
            if (chunkSize >= size && bufferSize === 0) {
                controller.enqueue(chunk);
            }
            else {
                const newSize = merge(buffers, mode, chunk);
                if (!streamBufferingLoggedWarning && bytesSeen > size * 2) {
                    streamBufferingLoggedWarning = true;
                    logger?.warn(`@smithy/util-stream - stream chunk size ${chunkSize} is below threshold of ${size}, automatically buffering.`);
                }
                if (newSize >= size) {
                    controller.enqueue(flush(buffers, mode));
                }
                else {
                    await pull(controller);
                }
            }
        }
    };
    return new ReadableStream({
        pull,
    });
}
exports.createBufferedReadable = createBufferedReadableStream;
function merge(buffers, mode, chunk) {
    switch (mode) {
        case 0:
            buffers[0] += chunk;
            return sizeOf(buffers[0]);
        case 1:
        case 2:
            buffers[mode].push(chunk);
            return sizeOf(buffers[mode]);
    }
}
function flush(buffers, mode) {
    switch (mode) {
        case 0:
            const s = buffers[0];
            buffers[0] = "";
            return s;
        case 1:
        case 2:
            return buffers[mode].flush();
    }
    throw new Error(`@smithy/util-stream - invalid index ${mode} given to flush()`);
}
function sizeOf(chunk) {
    return chunk?.byteLength ?? chunk?.length ?? 0;
}
function modeOf(chunk, allowBuffer = true) {
    if (allowBuffer && typeof Buffer !== "undefined" && chunk instanceof Buffer) {
        return 2;
    }
    if (chunk instanceof Uint8Array) {
        return 1;
    }
    if (typeof chunk === "string") {
        return 0;
    }
    return -1;
}


/***/ }),

/***/ 22505:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.getAwsChunkedEncodingStream = void 0;
const stream_1 = __webpack_require__(2203);
const getAwsChunkedEncodingStream = (readableStream, options) => {
    const { base64Encoder, bodyLengthChecker, checksumAlgorithmFn, checksumLocationName, streamHasher } = options;
    const checksumRequired = base64Encoder !== undefined &&
        checksumAlgorithmFn !== undefined &&
        checksumLocationName !== undefined &&
        streamHasher !== undefined;
    const digest = checksumRequired ? streamHasher(checksumAlgorithmFn, readableStream) : undefined;
    const awsChunkedEncodingStream = new stream_1.Readable({ read: () => { } });
    readableStream.on("data", (data) => {
        const length = bodyLengthChecker(data) || 0;
        awsChunkedEncodingStream.push(`${length.toString(16)}\r\n`);
        awsChunkedEncodingStream.push(data);
        awsChunkedEncodingStream.push("\r\n");
    });
    readableStream.on("end", async () => {
        awsChunkedEncodingStream.push(`0\r\n`);
        if (checksumRequired) {
            const checksum = base64Encoder(await digest);
            awsChunkedEncodingStream.push(`${checksumLocationName}:${checksum}\r\n`);
            awsChunkedEncodingStream.push(`\r\n`);
        }
        awsChunkedEncodingStream.push(null);
    });
    return awsChunkedEncodingStream;
};
exports.getAwsChunkedEncodingStream = getAwsChunkedEncodingStream;


/***/ }),

/***/ 45139:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.headStream = headStream;
async function headStream(stream, bytes) {
    let byteLengthCounter = 0;
    const chunks = [];
    const reader = stream.getReader();
    let isDone = false;
    while (!isDone) {
        const { done, value } = await reader.read();
        if (value) {
            chunks.push(value);
            byteLengthCounter += value?.byteLength ?? 0;
        }
        if (byteLengthCounter >= bytes) {
            break;
        }
        isDone = done;
    }
    reader.releaseLock();
    const collected = new Uint8Array(Math.min(bytes, byteLengthCounter));
    let offset = 0;
    for (const chunk of chunks) {
        if (chunk.byteLength > collected.byteLength - offset) {
            collected.set(chunk.subarray(0, collected.byteLength - offset), offset);
            break;
        }
        else {
            collected.set(chunk, offset);
        }
        offset += chunk.length;
    }
    return collected;
}


/***/ }),

/***/ 86901:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.headStream = void 0;
const stream_1 = __webpack_require__(2203);
const headStream_browser_1 = __webpack_require__(45139);
const stream_type_check_1 = __webpack_require__(37785);
const headStream = (stream, bytes) => {
    if ((0, stream_type_check_1.isReadableStream)(stream)) {
        return (0, headStream_browser_1.headStream)(stream, bytes);
    }
    return new Promise((resolve, reject) => {
        const collector = new Collector();
        collector.limit = bytes;
        stream.pipe(collector);
        stream.on("error", (err) => {
            collector.end();
            reject(err);
        });
        collector.on("error", reject);
        collector.on("finish", function () {
            const bytes = new Uint8Array(Buffer.concat(this.buffers));
            resolve(bytes);
        });
    });
};
exports.headStream = headStream;
class Collector extends stream_1.Writable {
    buffers = [];
    limit = Infinity;
    bytesBuffered = 0;
    _write(chunk, encoding, callback) {
        this.buffers.push(chunk);
        this.bytesBuffered += chunk.byteLength ?? 0;
        if (this.bytesBuffered >= this.limit) {
            const excess = this.bytesBuffered - this.limit;
            const tailBuffer = this.buffers[this.buffers.length - 1];
            this.buffers[this.buffers.length - 1] = tailBuffer.subarray(0, tailBuffer.byteLength - excess);
            this.emit("finish");
        }
        callback();
    }
}


/***/ }),

/***/ 64691:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {



var utilBase64 = __webpack_require__(72722);
var utilUtf8 = __webpack_require__(46090);
var ChecksumStream = __webpack_require__(72116);
var createChecksumStream = __webpack_require__(32384);
var createBufferedReadable = __webpack_require__(40260);
var getAwsChunkedEncodingStream = __webpack_require__(22505);
var headStream = __webpack_require__(86901);
var sdkStreamMixin = __webpack_require__(76992);
var splitStream = __webpack_require__(73423);
var streamTypeCheck = __webpack_require__(37785);

class Uint8ArrayBlobAdapter extends Uint8Array {
    static fromString(source, encoding = "utf-8") {
        if (typeof source === "string") {
            if (encoding === "base64") {
                return Uint8ArrayBlobAdapter.mutate(utilBase64.fromBase64(source));
            }
            return Uint8ArrayBlobAdapter.mutate(utilUtf8.fromUtf8(source));
        }
        throw new Error(`Unsupported conversion from ${typeof source} to Uint8ArrayBlobAdapter.`);
    }
    static mutate(source) {
        Object.setPrototypeOf(source, Uint8ArrayBlobAdapter.prototype);
        return source;
    }
    transformToString(encoding = "utf-8") {
        if (encoding === "base64") {
            return utilBase64.toBase64(this);
        }
        return utilUtf8.toUtf8(this);
    }
}

exports.Uint8ArrayBlobAdapter = Uint8ArrayBlobAdapter;
Object.keys(ChecksumStream).forEach(function (k) {
    if (k !== 'default' && !Object.prototype.hasOwnProperty.call(exports, k)) Object.defineProperty(exports, k, {
        enumerable: true,
        get: function () { return ChecksumStream[k]; }
    });
});
Object.keys(createChecksumStream).forEach(function (k) {
    if (k !== 'default' && !Object.prototype.hasOwnProperty.call(exports, k)) Object.defineProperty(exports, k, {
        enumerable: true,
        get: function () { return createChecksumStream[k]; }
    });
});
Object.keys(createBufferedReadable).forEach(function (k) {
    if (k !== 'default' && !Object.prototype.hasOwnProperty.call(exports, k)) Object.defineProperty(exports, k, {
        enumerable: true,
        get: function () { return createBufferedReadable[k]; }
    });
});
Object.keys(getAwsChunkedEncodingStream).forEach(function (k) {
    if (k !== 'default' && !Object.prototype.hasOwnProperty.call(exports, k)) Object.defineProperty(exports, k, {
        enumerable: true,
        get: function () { return getAwsChunkedEncodingStream[k]; }
    });
});
Object.keys(headStream).forEach(function (k) {
    if (k !== 'default' && !Object.prototype.hasOwnProperty.call(exports, k)) Object.defineProperty(exports, k, {
        enumerable: true,
        get: function () { return headStream[k]; }
    });
});
Object.keys(sdkStreamMixin).forEach(function (k) {
    if (k !== 'default' && !Object.prototype.hasOwnProperty.call(exports, k)) Object.defineProperty(exports, k, {
        enumerable: true,
        get: function () { return sdkStreamMixin[k]; }
    });
});
Object.keys(splitStream).forEach(function (k) {
    if (k !== 'default' && !Object.prototype.hasOwnProperty.call(exports, k)) Object.defineProperty(exports, k, {
        enumerable: true,
        get: function () { return splitStream[k]; }
    });
});
Object.keys(streamTypeCheck).forEach(function (k) {
    if (k !== 'default' && !Object.prototype.hasOwnProperty.call(exports, k)) Object.defineProperty(exports, k, {
        enumerable: true,
        get: function () { return streamTypeCheck[k]; }
    });
});


/***/ }),

/***/ 65958:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.sdkStreamMixin = void 0;
const fetch_http_handler_1 = __webpack_require__(9136);
const util_base64_1 = __webpack_require__(72722);
const util_hex_encoding_1 = __webpack_require__(79916);
const util_utf8_1 = __webpack_require__(46090);
const stream_type_check_1 = __webpack_require__(37785);
const ERR_MSG_STREAM_HAS_BEEN_TRANSFORMED = "The stream has already been transformed.";
const sdkStreamMixin = (stream) => {
    if (!isBlobInstance(stream) && !(0, stream_type_check_1.isReadableStream)(stream)) {
        const name = stream?.__proto__?.constructor?.name || stream;
        throw new Error(`Unexpected stream implementation, expect Blob or ReadableStream, got ${name}`);
    }
    let transformed = false;
    const transformToByteArray = async () => {
        if (transformed) {
            throw new Error(ERR_MSG_STREAM_HAS_BEEN_TRANSFORMED);
        }
        transformed = true;
        return await (0, fetch_http_handler_1.streamCollector)(stream);
    };
    const blobToWebStream = (blob) => {
        if (typeof blob.stream !== "function") {
            throw new Error("Cannot transform payload Blob to web stream. Please make sure the Blob.stream() is polyfilled.\n" +
                "If you are using React Native, this API is not yet supported, see: https://react-native.canny.io/feature-requests/p/fetch-streaming-body");
        }
        return blob.stream();
    };
    return Object.assign(stream, {
        transformToByteArray: transformToByteArray,
        transformToString: async (encoding) => {
            const buf = await transformToByteArray();
            if (encoding === "base64") {
                return (0, util_base64_1.toBase64)(buf);
            }
            else if (encoding === "hex") {
                return (0, util_hex_encoding_1.toHex)(buf);
            }
            else if (encoding === undefined || encoding === "utf8" || encoding === "utf-8") {
                return (0, util_utf8_1.toUtf8)(buf);
            }
            else if (typeof TextDecoder === "function") {
                return new TextDecoder(encoding).decode(buf);
            }
            else {
                throw new Error("TextDecoder is not available, please make sure polyfill is provided.");
            }
        },
        transformToWebStream: () => {
            if (transformed) {
                throw new Error(ERR_MSG_STREAM_HAS_BEEN_TRANSFORMED);
            }
            transformed = true;
            if (isBlobInstance(stream)) {
                return blobToWebStream(stream);
            }
            else if ((0, stream_type_check_1.isReadableStream)(stream)) {
                return stream;
            }
            else {
                throw new Error(`Cannot transform payload to web stream, got ${stream}`);
            }
        },
    });
};
exports.sdkStreamMixin = sdkStreamMixin;
const isBlobInstance = (stream) => typeof Blob === "function" && stream instanceof Blob;


/***/ }),

/***/ 76992:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.sdkStreamMixin = void 0;
const node_http_handler_1 = __webpack_require__(82764);
const util_buffer_from_1 = __webpack_require__(21266);
const stream_1 = __webpack_require__(2203);
const sdk_stream_mixin_browser_1 = __webpack_require__(65958);
const ERR_MSG_STREAM_HAS_BEEN_TRANSFORMED = "The stream has already been transformed.";
const sdkStreamMixin = (stream) => {
    if (!(stream instanceof stream_1.Readable)) {
        try {
            return (0, sdk_stream_mixin_browser_1.sdkStreamMixin)(stream);
        }
        catch (e) {
            const name = stream?.__proto__?.constructor?.name || stream;
            throw new Error(`Unexpected stream implementation, expect Stream.Readable instance, got ${name}`);
        }
    }
    let transformed = false;
    const transformToByteArray = async () => {
        if (transformed) {
            throw new Error(ERR_MSG_STREAM_HAS_BEEN_TRANSFORMED);
        }
        transformed = true;
        return await (0, node_http_handler_1.streamCollector)(stream);
    };
    return Object.assign(stream, {
        transformToByteArray,
        transformToString: async (encoding) => {
            const buf = await transformToByteArray();
            if (encoding === undefined || Buffer.isEncoding(encoding)) {
                return (0, util_buffer_from_1.fromArrayBuffer)(buf.buffer, buf.byteOffset, buf.byteLength).toString(encoding);
            }
            else {
                const decoder = new TextDecoder(encoding);
                return decoder.decode(buf);
            }
        },
        transformToWebStream: () => {
            if (transformed) {
                throw new Error(ERR_MSG_STREAM_HAS_BEEN_TRANSFORMED);
            }
            if (stream.readableFlowing !== null) {
                throw new Error("The stream has been consumed by other callbacks.");
            }
            if (typeof stream_1.Readable.toWeb !== "function") {
                throw new Error("Readable.toWeb() is not supported. Please ensure a polyfill is available.");
            }
            transformed = true;
            return stream_1.Readable.toWeb(stream);
        },
    });
};
exports.sdkStreamMixin = sdkStreamMixin;


/***/ }),

/***/ 16441:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.splitStream = splitStream;
async function splitStream(stream) {
    if (typeof stream.stream === "function") {
        stream = stream.stream();
    }
    const readableStream = stream;
    return readableStream.tee();
}


/***/ }),

/***/ 73423:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.splitStream = splitStream;
const stream_1 = __webpack_require__(2203);
const splitStream_browser_1 = __webpack_require__(16441);
const stream_type_check_1 = __webpack_require__(37785);
async function splitStream(stream) {
    if ((0, stream_type_check_1.isReadableStream)(stream) || (0, stream_type_check_1.isBlob)(stream)) {
        return (0, splitStream_browser_1.splitStream)(stream);
    }
    const stream1 = new stream_1.PassThrough();
    const stream2 = new stream_1.PassThrough();
    stream.pipe(stream1);
    stream.pipe(stream2);
    return [stream1, stream2];
}


/***/ }),

/***/ 37785:
/***/ ((__unused_webpack_module, exports) => {


Object.defineProperty(exports, "__esModule", ({ value: true }));
exports.isBlob = exports.isReadableStream = void 0;
const isReadableStream = (stream) => typeof ReadableStream === "function" &&
    (stream?.constructor?.name === ReadableStream.name || stream instanceof ReadableStream);
exports.isReadableStream = isReadableStream;
const isBlob = (blob) => {
    return typeof Blob === "function" && (blob?.constructor?.name === Blob.name || blob instanceof Blob);
};
exports.isBlob = isBlob;


/***/ }),

/***/ 87377:
/***/ ((__unused_webpack_module, exports) => {



const escapeUri = (uri) => encodeURIComponent(uri).replace(/[!'()*]/g, hexEncode);
const hexEncode = (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`;

const escapeUriPath = (uri) => uri.split("/").map(escapeUri).join("/");

exports.escapeUri = escapeUri;
exports.escapeUriPath = escapeUriPath;


/***/ }),

/***/ 46090:
/***/ ((__unused_webpack_module, exports, __webpack_require__) => {



var utilBufferFrom = __webpack_require__(21266);

const fromUtf8 = (input) => {
    const buf = utilBufferFrom.fromString(input, "utf8");
    return new Uint8Array(buf.buffer, buf.byteOffset, buf.byteLength / Uint8Array.BYTES_PER_ELEMENT);
};

const toUint8Array = (data) => {
    if (typeof data === "string") {
        return fromUtf8(data);
    }
    if (ArrayBuffer.isView(data)) {
        return new Uint8Array(data.buffer, data.byteOffset, data.byteLength / Uint8Array.BYTES_PER_ELEMENT);
    }
    return new Uint8Array(data);
};

const toUtf8 = (input) => {
    if (typeof input === "string") {
        return input;
    }
    if (typeof input !== "object" || typeof input.byteOffset !== "number" || typeof input.byteLength !== "number") {
        throw new Error("@smithy/util-utf8: toUtf8 encoder function only accepts string | Uint8Array.");
    }
    return utilBufferFrom.fromArrayBuffer(input.buffer, input.byteOffset, input.byteLength).toString("utf8");
};

exports.fromUtf8 = fromUtf8;
exports.toUint8Array = toUint8Array;
exports.toUtf8 = toUtf8;


/***/ }),

/***/ 39955:
/***/ ((module) => {

module.exports = /*#__PURE__*/JSON.parse('{"name":"@aws-sdk/nested-clients","version":"3.911.0","description":"Nested clients for AWS SDK packages.","main":"./dist-cjs/index.js","module":"./dist-es/index.js","types":"./dist-types/index.d.ts","scripts":{"build":"yarn lint && concurrently \'yarn:build:cjs\' \'yarn:build:es\' \'yarn:build:types\'","build:cjs":"node ../../scripts/compilation/inline nested-clients","build:es":"tsc -p tsconfig.es.json","build:include:deps":"lerna run --scope $npm_package_name --include-dependencies build","build:types":"tsc -p tsconfig.types.json","build:types:downlevel":"downlevel-dts dist-types dist-types/ts3.4","clean":"rimraf ./dist-* && rimraf *.tsbuildinfo","lint":"node ../../scripts/validation/submodules-linter.js --pkg nested-clients","test":"yarn g:vitest run","test:watch":"yarn g:vitest watch"},"engines":{"node":">=18.0.0"},"sideEffects":false,"author":{"name":"AWS SDK for JavaScript Team","url":"https://aws.amazon.com/javascript/"},"license":"Apache-2.0","dependencies":{"@aws-crypto/sha256-browser":"5.2.0","@aws-crypto/sha256-js":"5.2.0","@aws-sdk/core":"3.911.0","@aws-sdk/middleware-host-header":"3.910.0","@aws-sdk/middleware-logger":"3.910.0","@aws-sdk/middleware-recursion-detection":"3.910.0","@aws-sdk/middleware-user-agent":"3.911.0","@aws-sdk/region-config-resolver":"3.910.0","@aws-sdk/types":"3.910.0","@aws-sdk/util-endpoints":"3.910.0","@aws-sdk/util-user-agent-browser":"3.910.0","@aws-sdk/util-user-agent-node":"3.911.0","@smithy/config-resolver":"^4.3.2","@smithy/core":"^3.16.1","@smithy/fetch-http-handler":"^5.3.3","@smithy/hash-node":"^4.2.2","@smithy/invalid-dependency":"^4.2.2","@smithy/middleware-content-length":"^4.2.2","@smithy/middleware-endpoint":"^4.3.3","@smithy/middleware-retry":"^4.4.3","@smithy/middleware-serde":"^4.2.2","@smithy/middleware-stack":"^4.2.2","@smithy/node-config-provider":"^4.3.2","@smithy/node-http-handler":"^4.4.1","@smithy/protocol-http":"^5.3.2","@smithy/smithy-client":"^4.8.1","@smithy/types":"^4.7.1","@smithy/url-parser":"^4.2.2","@smithy/util-base64":"^4.3.0","@smithy/util-body-length-browser":"^4.2.0","@smithy/util-body-length-node":"^4.2.1","@smithy/util-defaults-mode-browser":"^4.3.2","@smithy/util-defaults-mode-node":"^4.2.3","@smithy/util-endpoints":"^3.2.2","@smithy/util-middleware":"^4.2.2","@smithy/util-retry":"^4.2.2","@smithy/util-utf8":"^4.2.0","tslib":"^2.6.2"},"devDependencies":{"concurrently":"7.0.0","downlevel-dts":"0.10.1","rimraf":"3.0.2","typescript":"~5.8.3"},"typesVersions":{"<4.0":{"dist-types/*":["dist-types/ts3.4/*"]}},"files":["./sso-oidc.d.ts","./sso-oidc.js","./sts.d.ts","./sts.js","dist-*/**"],"browser":{"./dist-es/submodules/sso-oidc/runtimeConfig":"./dist-es/submodules/sso-oidc/runtimeConfig.browser","./dist-es/submodules/sts/runtimeConfig":"./dist-es/submodules/sts/runtimeConfig.browser"},"react-native":{},"homepage":"https://github.com/aws/aws-sdk-js-v3/tree/main/packages/nested-clients","repository":{"type":"git","url":"https://github.com/aws/aws-sdk-js-v3.git","directory":"packages/nested-clients"},"exports":{"./sso-oidc":{"types":"./dist-types/submodules/sso-oidc/index.d.ts","module":"./dist-es/submodules/sso-oidc/index.js","node":"./dist-cjs/submodules/sso-oidc/index.js","import":"./dist-es/submodules/sso-oidc/index.js","require":"./dist-cjs/submodules/sso-oidc/index.js"},"./sts":{"types":"./dist-types/submodules/sts/index.d.ts","module":"./dist-es/submodules/sts/index.js","node":"./dist-cjs/submodules/sts/index.js","import":"./dist-es/submodules/sts/index.js","require":"./dist-cjs/submodules/sts/index.js"}}}');

/***/ })

};
;