export namespace agent_extensions {
	
	export class ToolInvocationAudit {
	    id: string;
	    conversationId?: string;
	    sourceId: string;
	    capabilityName: string;
	    parameterSummary: string;
	    authorizationDecision: string;
	    riskClass: string;
	    // Go type: time
	    startedAt: any;
	    durationMs: number;
	    resultStatus: string;
	    errorCode?: string;
	
	    static createFrom(source: any = {}) {
	        return new ToolInvocationAudit(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.conversationId = source["conversationId"];
	        this.sourceId = source["sourceId"];
	        this.capabilityName = source["capabilityName"];
	        this.parameterSummary = source["parameterSummary"];
	        this.authorizationDecision = source["authorizationDecision"];
	        this.riskClass = source["riskClass"];
	        this.startedAt = this.convertValues(source["startedAt"], null);
	        this.durationMs = source["durationMs"];
	        this.resultStatus = source["resultStatus"];
	        this.errorCode = source["errorCode"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class AuthorizationGrant {
	    id: string;
	    sourceId: string;
	    sourceType: string;
	    capabilityName: string;
	    parameterScope: string;
	    decision: string;
	    mode: string;
	    fingerprint: string;
	    // Go type: time
	    createdAt: any;
	    // Go type: time
	    expiresAt?: any;
	
	    static createFrom(source: any = {}) {
	        return new AuthorizationGrant(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.sourceId = source["sourceId"];
	        this.sourceType = source["sourceType"];
	        this.capabilityName = source["capabilityName"];
	        this.parameterScope = source["parameterScope"];
	        this.decision = source["decision"];
	        this.mode = source["mode"];
	        this.fingerprint = source["fingerprint"];
	        this.createdAt = this.convertValues(source["createdAt"], null);
	        this.expiresAt = this.convertValues(source["expiresAt"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class MCPTool {
	    name: string;
	    description?: string;
	    inputSchema?: Record<string, any>;
	    riskClass: string;
	
	    static createFrom(source: any = {}) {
	        return new MCPTool(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.description = source["description"];
	        this.inputSchema = source["inputSchema"];
	        this.riskClass = source["riskClass"];
	    }
	}
	export class MCPEnvironmentVariable {
	    name: string;
	    value?: string;
	    secret: boolean;
	    configured: boolean;
	    credentialRef?: string;
	
	    static createFrom(source: any = {}) {
	        return new MCPEnvironmentVariable(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.value = source["value"];
	        this.secret = source["secret"];
	        this.configured = source["configured"];
	        this.credentialRef = source["credentialRef"];
	    }
	}
	export class MCPServer {
	    id: string;
	    name: string;
	    description?: string;
	    command: string;
	    args: string[];
	    env: MCPEnvironmentVariable[];
	    enabled: boolean;
	    capabilityFingerprint: string;
	    runtimeStatus: string;
	    lastError?: string;
	    // Go type: time
	    lastStartedAt?: any;
	    // Go type: time
	    lastUsedAt?: any;
	    idleTimeoutSeconds: number;
	    requestTimeoutSeconds: number;
	    tools?: MCPTool[];
	    // Go type: time
	    createdAt: any;
	    // Go type: time
	    updatedAt: any;
	
	    static createFrom(source: any = {}) {
	        return new MCPServer(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.description = source["description"];
	        this.command = source["command"];
	        this.args = source["args"];
	        this.env = this.convertValues(source["env"], MCPEnvironmentVariable);
	        this.enabled = source["enabled"];
	        this.capabilityFingerprint = source["capabilityFingerprint"];
	        this.runtimeStatus = source["runtimeStatus"];
	        this.lastError = source["lastError"];
	        this.lastStartedAt = this.convertValues(source["lastStartedAt"], null);
	        this.lastUsedAt = this.convertValues(source["lastUsedAt"], null);
	        this.idleTimeoutSeconds = source["idleTimeoutSeconds"];
	        this.requestTimeoutSeconds = source["requestTimeoutSeconds"];
	        this.tools = this.convertValues(source["tools"], MCPTool);
	        this.createdAt = this.convertValues(source["createdAt"], null);
	        this.updatedAt = this.convertValues(source["updatedAt"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class Skill {
	    id: string;
	    name: string;
	    description: string;
	    version?: string;
	    sourceType: string;
	    sourcePath: string;
	    installPath: string;
	    contentHash: string;
	    enabled: boolean;
	    scriptExecutionEnabled: boolean;
	    validationStatus: string;
	    validationError?: string;
	    // Go type: time
	    installedAt: any;
	    // Go type: time
	    updatedAt: any;
	
	    static createFrom(source: any = {}) {
	        return new Skill(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.description = source["description"];
	        this.version = source["version"];
	        this.sourceType = source["sourceType"];
	        this.sourcePath = source["sourcePath"];
	        this.installPath = source["installPath"];
	        this.contentHash = source["contentHash"];
	        this.enabled = source["enabled"];
	        this.scriptExecutionEnabled = source["scriptExecutionEnabled"];
	        this.validationStatus = source["validationStatus"];
	        this.validationError = source["validationError"];
	        this.installedAt = this.convertValues(source["installedAt"], null);
	        this.updatedAt = this.convertValues(source["updatedAt"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class AgentExtensionSnapshot {
	    skills: Skill[];
	    mcpServers: MCPServer[];
	    authorizations: AuthorizationGrant[];
	    audits: ToolInvocationAudit[];
	
	    static createFrom(source: any = {}) {
	        return new AgentExtensionSnapshot(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.skills = this.convertValues(source["skills"], Skill);
	        this.mcpServers = this.convertValues(source["mcpServers"], MCPServer);
	        this.authorizations = this.convertValues(source["authorizations"], AuthorizationGrant);
	        this.audits = this.convertValues(source["audits"], ToolInvocationAudit);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	
	export class MCPServerInput {
	    id?: string;
	    name: string;
	    description?: string;
	    command: string;
	    args: string[];
	    env: MCPEnvironmentVariable[];
	    enabled: boolean;
	    idleTimeoutSeconds: number;
	    requestTimeoutSeconds: number;
	
	    static createFrom(source: any = {}) {
	        return new MCPServerInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.description = source["description"];
	        this.command = source["command"];
	        this.args = source["args"];
	        this.env = this.convertValues(source["env"], MCPEnvironmentVariable);
	        this.enabled = source["enabled"];
	        this.idleTimeoutSeconds = source["idleTimeoutSeconds"];
	        this.requestTimeoutSeconds = source["requestTimeoutSeconds"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class MCPToolCallInput {
	    serverId: string;
	    toolName: string;
	    arguments: Record<string, any>;
	    conversationId?: string;
	    approved: boolean;
	    remember: boolean;
	    parameterScope?: string;
	    invocationId?: string;
	
	    static createFrom(source: any = {}) {
	        return new MCPToolCallInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.serverId = source["serverId"];
	        this.toolName = source["toolName"];
	        this.arguments = source["arguments"];
	        this.conversationId = source["conversationId"];
	        this.approved = source["approved"];
	        this.remember = source["remember"];
	        this.parameterScope = source["parameterScope"];
	        this.invocationId = source["invocationId"];
	    }
	}
	export class MCPToolCallResult {
	    content?: any;
	    isError: boolean;
	    permissionRequired: boolean;
	    riskClass: string;
	    parameterSummary: string;
	
	    static createFrom(source: any = {}) {
	        return new MCPToolCallResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.content = source["content"];
	        this.isError = source["isError"];
	        this.permissionRequired = source["permissionRequired"];
	        this.riskClass = source["riskClass"];
	        this.parameterSummary = source["parameterSummary"];
	    }
	}
	
	export class SkillReference {
	    path: string;
	    content: string;
	
	    static createFrom(source: any = {}) {
	        return new SkillReference(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.content = source["content"];
	    }
	}
	export class SkillContent {
	    skill: Skill;
	    instructions: string;
	    references: SkillReference[];
	
	    static createFrom(source: any = {}) {
	        return new SkillContent(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.skill = this.convertValues(source["skill"], Skill);
	        this.instructions = source["instructions"];
	        this.references = this.convertValues(source["references"], SkillReference);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class SkillResource {
	    skill: Skill;
	    path: string;
	    content: string;
	    references: string[];
	
	    static createFrom(source: any = {}) {
	        return new SkillResource(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.skill = this.convertValues(source["skill"], Skill);
	        this.path = source["path"];
	        this.content = source["content"];
	        this.references = source["references"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace config {
	
	export class AIProviderConfig {
	    base_url: string;
	    api_key: string;
	    models: string[];
	    image_models?: string[];
	    vision_models?: string[];
	    tool_models?: string[];
	    structured_output_models?: string[];
	    context_windows?: Record<string, number>;
	
	    static createFrom(source: any = {}) {
	        return new AIProviderConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.base_url = source["base_url"];
	        this.api_key = source["api_key"];
	        this.models = source["models"];
	        this.image_models = source["image_models"];
	        this.vision_models = source["vision_models"];
	        this.tool_models = source["tool_models"];
	        this.structured_output_models = source["structured_output_models"];
	        this.context_windows = source["context_windows"];
	    }
	}
	export class AIConfig {
	    base_url?: string;
	    api_key?: string;
	    model?: string;
	    default_model: string;
	    default_image_model?: string;
	    providers: Record<string, AIProviderConfig>;
	
	    static createFrom(source: any = {}) {
	        return new AIConfig(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.base_url = source["base_url"];
	        this.api_key = source["api_key"];
	        this.model = source["model"];
	        this.default_model = source["default_model"];
	        this.default_image_model = source["default_image_model"];
	        this.providers = this.convertValues(source["providers"], AIProviderConfig, true);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace image {
	
	export class GPSData {
	    latitude: number;
	    longitude: number;
	    altitude?: number;
	    dateStamp?: string;
	
	    static createFrom(source: any = {}) {
	        return new GPSData(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.latitude = source["latitude"];
	        this.longitude = source["longitude"];
	        this.altitude = source["altitude"];
	        this.dateStamp = source["dateStamp"];
	    }
	}
	export class ExifData {
	    cameraMake?: string;
	    cameraModel?: string;
	    lensModel?: string;
	    focalLength?: string;
	    aperture?: string;
	    shutterSpeed?: string;
	    iso?: number;
	    // Go type: time
	    takenAt?: any;
	    orientation?: number;
	    software?: string;
	    gps?: GPSData;
	    raw?: string;
	
	    static createFrom(source: any = {}) {
	        return new ExifData(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.cameraMake = source["cameraMake"];
	        this.cameraModel = source["cameraModel"];
	        this.lensModel = source["lensModel"];
	        this.focalLength = source["focalLength"];
	        this.aperture = source["aperture"];
	        this.shutterSpeed = source["shutterSpeed"];
	        this.iso = source["iso"];
	        this.takenAt = this.convertValues(source["takenAt"], null);
	        this.orientation = source["orientation"];
	        this.software = source["software"];
	        this.gps = this.convertValues(source["gps"], GPSData);
	        this.raw = source["raw"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}

}

export namespace local_library {
	
	export class AssetCollectionDTO {
	    id: string;
	    name: string;
	
	    static createFrom(source: any = {}) {
	        return new AssetCollectionDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	    }
	}
	export class TagDTO {
	    id: string;
	    name: string;
	    color?: string;
	    assetCount: number;
	
	    static createFrom(source: any = {}) {
	        return new TagDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.color = source["color"];
	        this.assetCount = source["assetCount"];
	    }
	}
	export class ExifMetadataDTO {
	    cameraMake?: string;
	    cameraModel?: string;
	    lensModel?: string;
	    iso?: number;
	    aperture?: number;
	    shutterSeconds?: number;
	    focalLengthMm?: number;
	    latitude?: number;
	    longitude?: number;
	
	    static createFrom(source: any = {}) {
	        return new ExifMetadataDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.cameraMake = source["cameraMake"];
	        this.cameraModel = source["cameraModel"];
	        this.lensModel = source["lensModel"];
	        this.iso = source["iso"];
	        this.aperture = source["aperture"];
	        this.shutterSeconds = source["shutterSeconds"];
	        this.focalLengthMm = source["focalLengthMm"];
	        this.latitude = source["latitude"];
	        this.longitude = source["longitude"];
	    }
	}
	export class AssetDTO {
	    id: string;
	    relativePath: string;
	    fileName: string;
	    extension: string;
	    format: string;
	    mimeType: string;
	    mediaKind: string;
	    byteSize: number;
	    modifiedAtNs: number;
	    width: number;
	    height: number;
	    orientation: number;
	    isAnimated: boolean;
	    frameCount: number;
	    availability: string;
	    trashEntryId?: string;
	    trashEntryKind?: string;
	    previewStatus: string;
	    previewError?: string;
	    metadataStatus: string;
	    dominantColors?: string[];
	    displayTitle?: string;
	    notes?: string;
	    rating: number;
	    colorLabel?: string;
	    isFavorite: boolean;
	    // Go type: time
	    capturedAt?: any;
	    exif?: ExifMetadataDTO;
	    // Go type: time
	    discoveredAt: any;
	    thumbnailUrl: string;
	    previewUrl: string;
	    originalUrl: string;
	    cloudPhotoId?: string;
	    cloudUrl?: string;
	    isUploaded: boolean;
	    tags: TagDTO[];
	    collections: AssetCollectionDTO[];
	
	    static createFrom(source: any = {}) {
	        return new AssetDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.relativePath = source["relativePath"];
	        this.fileName = source["fileName"];
	        this.extension = source["extension"];
	        this.format = source["format"];
	        this.mimeType = source["mimeType"];
	        this.mediaKind = source["mediaKind"];
	        this.byteSize = source["byteSize"];
	        this.modifiedAtNs = source["modifiedAtNs"];
	        this.width = source["width"];
	        this.height = source["height"];
	        this.orientation = source["orientation"];
	        this.isAnimated = source["isAnimated"];
	        this.frameCount = source["frameCount"];
	        this.availability = source["availability"];
	        this.trashEntryId = source["trashEntryId"];
	        this.trashEntryKind = source["trashEntryKind"];
	        this.previewStatus = source["previewStatus"];
	        this.previewError = source["previewError"];
	        this.metadataStatus = source["metadataStatus"];
	        this.dominantColors = source["dominantColors"];
	        this.displayTitle = source["displayTitle"];
	        this.notes = source["notes"];
	        this.rating = source["rating"];
	        this.colorLabel = source["colorLabel"];
	        this.isFavorite = source["isFavorite"];
	        this.capturedAt = this.convertValues(source["capturedAt"], null);
	        this.exif = this.convertValues(source["exif"], ExifMetadataDTO);
	        this.discoveredAt = this.convertValues(source["discoveredAt"], null);
	        this.thumbnailUrl = source["thumbnailUrl"];
	        this.previewUrl = source["previewUrl"];
	        this.originalUrl = source["originalUrl"];
	        this.cloudPhotoId = source["cloudPhotoId"];
	        this.cloudUrl = source["cloudUrl"];
	        this.isUploaded = source["isUploaded"];
	        this.tags = this.convertValues(source["tags"], TagDTO);
	        this.collections = this.convertValues(source["collections"], AssetCollectionDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class AssetMoveResult {
	    assetId: string;
	    source?: string;
	    destination?: string;
	    status: string;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new AssetMoveResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.assetId = source["assetId"];
	        this.source = source["source"];
	        this.destination = source["destination"];
	        this.status = source["status"];
	        this.error = source["error"];
	    }
	}
	export class AssetFileOperationExecution {
	    planId: string;
	    status: string;
	    results: AssetMoveResult[];
	
	    static createFrom(source: any = {}) {
	        return new AssetFileOperationExecution(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.planId = source["planId"];
	        this.status = source["status"];
	        this.results = this.convertValues(source["results"], AssetMoveResult);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class AssetFileOperationItem {
	    assetId: string;
	    source: string;
	    destination: string;
	    conflict: boolean;
	    warning?: string;
	
	    static createFrom(source: any = {}) {
	        return new AssetFileOperationItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.assetId = source["assetId"];
	        this.source = source["source"];
	        this.destination = source["destination"];
	        this.conflict = source["conflict"];
	        this.warning = source["warning"];
	    }
	}
	export class AssetFileOperationPlan {
	    id: string;
	    version: number;
	    kind: string;
	    destinationFolder: string;
	    conflictPolicy: string;
	    items: AssetFileOperationItem[];
	    conflictCount: number;
	    totalBytes: number;
	    // Go type: time
	    createdAt: any;
	
	    static createFrom(source: any = {}) {
	        return new AssetFileOperationPlan(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.version = source["version"];
	        this.kind = source["kind"];
	        this.destinationFolder = source["destinationFolder"];
	        this.conflictPolicy = source["conflictPolicy"];
	        this.items = this.convertValues(source["items"], AssetFileOperationItem);
	        this.conflictCount = source["conflictCount"];
	        this.totalBytes = source["totalBytes"];
	        this.createdAt = this.convertValues(source["createdAt"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class AssetMaintenanceResult {
	    assetId: string;
	    status: string;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new AssetMaintenanceResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.assetId = source["assetId"];
	        this.status = source["status"];
	        this.error = source["error"];
	    }
	}
	
	export class ScanStatus {
	    state: string;
	    current: number;
	    total?: number;
	    lastPath?: string;
	    error?: string;
	    // Go type: time
	    startedAt?: any;
	    // Go type: time
	    finishedAt?: any;
	
	    static createFrom(source: any = {}) {
	        return new ScanStatus(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.state = source["state"];
	        this.current = source["current"];
	        this.total = source["total"];
	        this.lastPath = source["lastPath"];
	        this.error = source["error"];
	        this.startedAt = this.convertValues(source["startedAt"], null);
	        this.finishedAt = this.convertValues(source["finishedAt"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class AssetPage {
	    items: AssetDTO[];
	    nextCursor?: string;
	    total: number;
	    isComplete: boolean;
	    scan: ScanStatus;
	
	    static createFrom(source: any = {}) {
	        return new AssetPage(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.items = this.convertValues(source["items"], AssetDTO);
	        this.nextCursor = source["nextCursor"];
	        this.total = source["total"];
	        this.isComplete = source["isComplete"];
	        this.scan = this.convertValues(source["scan"], ScanStatus);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class AssetQuery {
	    cursor?: string;
	    limit?: number;
	    folder?: string;
	    directFolderOnly?: boolean;
	    search?: string;
	    availability?: string;
	    uploadStatus?: string;
	    favoritesOnly?: boolean;
	    photosOnly?: boolean;
	    tagIds?: string[];
	    collectionIds?: string[];
	    ratingMin?: number;
	    ratingMax?: number;
	    colorLabels?: string[];
	    formats?: string[];
	    previewStatuses?: string[];
	    capturedFromMs?: number;
	    capturedToMs?: number;
	    discoveredFromMs?: number;
	    discoveredToMs?: number;
	    cameraMakes?: string[];
	    cameraModels?: string[];
	    lensModels?: string[];
	    isoMin?: number;
	    isoMax?: number;
	    apertureMin?: number;
	    apertureMax?: number;
	    focalLengthMin?: number;
	    focalLengthMax?: number;
	    orientation?: string;
	    widthMin?: number;
	    widthMax?: number;
	    heightMin?: number;
	    heightMax?: number;
	    sort?: string;
	    sortDirection?: string;
	
	    static createFrom(source: any = {}) {
	        return new AssetQuery(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.cursor = source["cursor"];
	        this.limit = source["limit"];
	        this.folder = source["folder"];
	        this.directFolderOnly = source["directFolderOnly"];
	        this.search = source["search"];
	        this.availability = source["availability"];
	        this.uploadStatus = source["uploadStatus"];
	        this.favoritesOnly = source["favoritesOnly"];
	        this.photosOnly = source["photosOnly"];
	        this.tagIds = source["tagIds"];
	        this.collectionIds = source["collectionIds"];
	        this.ratingMin = source["ratingMin"];
	        this.ratingMax = source["ratingMax"];
	        this.colorLabels = source["colorLabels"];
	        this.formats = source["formats"];
	        this.previewStatuses = source["previewStatuses"];
	        this.capturedFromMs = source["capturedFromMs"];
	        this.capturedToMs = source["capturedToMs"];
	        this.discoveredFromMs = source["discoveredFromMs"];
	        this.discoveredToMs = source["discoveredToMs"];
	        this.cameraMakes = source["cameraMakes"];
	        this.cameraModels = source["cameraModels"];
	        this.lensModels = source["lensModels"];
	        this.isoMin = source["isoMin"];
	        this.isoMax = source["isoMax"];
	        this.apertureMin = source["apertureMin"];
	        this.apertureMax = source["apertureMax"];
	        this.focalLengthMin = source["focalLengthMin"];
	        this.focalLengthMax = source["focalLengthMax"];
	        this.orientation = source["orientation"];
	        this.widthMin = source["widthMin"];
	        this.widthMax = source["widthMax"];
	        this.heightMin = source["heightMin"];
	        this.heightMax = source["heightMax"];
	        this.sort = source["sort"];
	        this.sortDirection = source["sortDirection"];
	    }
	}
	export class AssetQueryToken {
	    token: string;
	    total: number;
	    // Go type: time
	    expiresAt: any;
	
	    static createFrom(source: any = {}) {
	        return new AssetQueryToken(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.token = source["token"];
	        this.total = source["total"];
	        this.expiresAt = this.convertValues(source["expiresAt"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class BackupInfo {
	    id: string;
	    kind: string;
	    // Go type: time
	    createdAt: any;
	    sizeBytes: number;
	
	    static createFrom(source: any = {}) {
	        return new BackupInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.kind = source["kind"];
	        this.createdAt = this.convertValues(source["createdAt"], null);
	        this.sizeBytes = source["sizeBytes"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class BackupOverview {
	    libraryName: string;
	    libraryRoot: string;
	    backups: BackupInfo[];
	
	    static createFrom(source: any = {}) {
	        return new BackupOverview(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.libraryName = source["libraryName"];
	        this.libraryRoot = source["libraryRoot"];
	        this.backups = this.convertValues(source["backups"], BackupInfo);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class BatchAssetOrganizationUpdate {
	    assetIds: string[];
	    rating?: number;
	    colorLabel?: string;
	    isFavorite?: boolean;
	    addTagIds?: string[];
	    removeTagIds?: string[];
	    addCollectionIds?: string[];
	    removeCollectionIds?: string[];
	
	    static createFrom(source: any = {}) {
	        return new BatchAssetOrganizationUpdate(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.assetIds = source["assetIds"];
	        this.rating = source["rating"];
	        this.colorLabel = source["colorLabel"];
	        this.isFavorite = source["isFavorite"];
	        this.addTagIds = source["addTagIds"];
	        this.removeTagIds = source["removeTagIds"];
	        this.addCollectionIds = source["addCollectionIds"];
	        this.removeCollectionIds = source["removeCollectionIds"];
	    }
	}
	export class CacheUsage {
	    fileCount: number;
	    bytes: number;
	
	    static createFrom(source: any = {}) {
	        return new CacheUsage(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.fileCount = source["fileCount"];
	        this.bytes = source["bytes"];
	    }
	}
	export class CollectionDTO {
	    id: string;
	    groupId?: string;
	    name: string;
	    notes?: string;
	    position: number;
	    assetCount: number;
	
	    static createFrom(source: any = {}) {
	        return new CollectionDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.groupId = source["groupId"];
	        this.name = source["name"];
	        this.notes = source["notes"];
	        this.position = source["position"];
	        this.assetCount = source["assetCount"];
	    }
	}
	export class CollectionGroupDTO {
	    id: string;
	    parentId?: string;
	    name: string;
	    position: number;
	
	    static createFrom(source: any = {}) {
	        return new CollectionGroupDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.parentId = source["parentId"];
	        this.name = source["name"];
	        this.position = source["position"];
	    }
	}
	
	export class FolderDTO {
	    id: string;
	    parentId?: string;
	    relativePath: string;
	    name: string;
	    assetCount: number;
	
	    static createFrom(source: any = {}) {
	        return new FolderDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.parentId = source["parentId"];
	        this.relativePath = source["relativePath"];
	        this.name = source["name"];
	        this.assetCount = source["assetCount"];
	    }
	}
	export class FolderDeletionPreview {
	    relativePath: string;
	    name: string;
	    managedAssetCount: number;
	    otherFileCount: number;
	    directoryCount: number;
	    totalBytes: number;
	
	    static createFrom(source: any = {}) {
	        return new FolderDeletionPreview(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.relativePath = source["relativePath"];
	        this.name = source["name"];
	        this.managedAssetCount = source["managedAssetCount"];
	        this.otherFileCount = source["otherFileCount"];
	        this.directoryCount = source["directoryCount"];
	        this.totalBytes = source["totalBytes"];
	    }
	}
	export class FolderFileOperationExecution {
	    planId: string;
	    status: string;
	    folder: FolderDTO;
	
	    static createFrom(source: any = {}) {
	        return new FolderFileOperationExecution(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.planId = source["planId"];
	        this.status = source["status"];
	        this.folder = this.convertValues(source["folder"], FolderDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class FolderFileOperationItem {
	    source: string;
	    destination: string;
	    kind: string;
	    conflict: boolean;
	
	    static createFrom(source: any = {}) {
	        return new FolderFileOperationItem(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.source = source["source"];
	        this.destination = source["destination"];
	        this.kind = source["kind"];
	        this.conflict = source["conflict"];
	    }
	}
	export class FolderFileOperationPlan {
	    id: string;
	    version: number;
	    kind: string;
	    source: string;
	    destination: string;
	    conflictPolicy: string;
	    items: FolderFileOperationItem[];
	    managedAssetCount: number;
	    otherFileCount: number;
	    directoryCount: number;
	    totalBytes: number;
	    conflictCount: number;
	    // Go type: time
	    createdAt: any;
	
	    static createFrom(source: any = {}) {
	        return new FolderFileOperationPlan(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.version = source["version"];
	        this.kind = source["kind"];
	        this.source = source["source"];
	        this.destination = source["destination"];
	        this.conflictPolicy = source["conflictPolicy"];
	        this.items = this.convertValues(source["items"], FolderFileOperationItem);
	        this.managedAssetCount = source["managedAssetCount"];
	        this.otherFileCount = source["otherFileCount"];
	        this.directoryCount = source["directoryCount"];
	        this.totalBytes = source["totalBytes"];
	        this.conflictCount = source["conflictCount"];
	        this.createdAt = this.convertValues(source["createdAt"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class FolderProperties {
	    relativePath: string;
	    name: string;
	    photoCount: number;
	    childCount: number;
	    byteSize: number;
	    // Go type: time
	    modifiedAt: any;
	    isRoot: boolean;
	
	    static createFrom(source: any = {}) {
	        return new FolderProperties(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.relativePath = source["relativePath"];
	        this.name = source["name"];
	        this.photoCount = source["photoCount"];
	        this.childCount = source["childCount"];
	        this.byteSize = source["byteSize"];
	        this.modifiedAt = this.convertValues(source["modifiedAt"], null);
	        this.isRoot = source["isRoot"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class FolderTrashEntry {
	    id: string;
	    originalPath: string;
	    name: string;
	    managedAssetCount: number;
	    otherFileCount: number;
	    directoryCount: number;
	    totalBytes: number;
	    // Go type: time
	    trashedAt: any;
	
	    static createFrom(source: any = {}) {
	        return new FolderTrashEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.originalPath = source["originalPath"];
	        this.name = source["name"];
	        this.managedAssetCount = source["managedAssetCount"];
	        this.otherFileCount = source["otherFileCount"];
	        this.directoryCount = source["directoryCount"];
	        this.totalBytes = source["totalBytes"];
	        this.trashedAt = this.convertValues(source["trashedAt"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class ImportResult {
	    source: string;
	    destination?: string;
	    assetId?: string;
	    status: string;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new ImportResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.source = source["source"];
	        this.destination = source["destination"];
	        this.assetId = source["assetId"];
	        this.status = source["status"];
	        this.error = source["error"];
	    }
	}
	export class LibrarySnapshot {
	    sessionId: string;
	    libraryId: string;
	    name: string;
	    rootPath: string;
	    state: string;
	    assetCount: number;
	    missingCount: number;
	    trashCount: number;
	    scan: ScanStatus;
	
	    static createFrom(source: any = {}) {
	        return new LibrarySnapshot(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.sessionId = source["sessionId"];
	        this.libraryId = source["libraryId"];
	        this.name = source["name"];
	        this.rootPath = source["rootPath"];
	        this.state = source["state"];
	        this.assetCount = source["assetCount"];
	        this.missingCount = source["missingCount"];
	        this.trashCount = source["trashCount"];
	        this.scan = this.convertValues(source["scan"], ScanStatus);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class LocalLibraryCacheStats {
	    internal: CacheUsage;
	    libraryData: CacheUsage;
	    thumbnails: CacheUsage;
	    previews: CacheUsage;
	    totalBytes: number;
	    previewLimitBytes: number;
	
	    static createFrom(source: any = {}) {
	        return new LocalLibraryCacheStats(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.internal = this.convertValues(source["internal"], CacheUsage);
	        this.libraryData = this.convertValues(source["libraryData"], CacheUsage);
	        this.thumbnails = this.convertValues(source["thumbnails"], CacheUsage);
	        this.previews = this.convertValues(source["previews"], CacheUsage);
	        this.totalBytes = source["totalBytes"];
	        this.previewLimitBytes = source["previewLimitBytes"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class LocalLibraryPreferences {
	    importMode?: string;
	
	    static createFrom(source: any = {}) {
	        return new LocalLibraryPreferences(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.importMode = source["importMode"];
	    }
	}
	
	
	export class TrashResult {
	    assetId: string;
	    status: string;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new TrashResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.assetId = source["assetId"];
	        this.status = source["status"];
	        this.error = source["error"];
	    }
	}

}

export namespace main {
	
	export class WindowAppearance {
	    activeStyle: string;
	    configuredStyle: string;
	
	    static createFrom(source: any = {}) {
	        return new WindowAppearance(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.activeStyle = source["activeStyle"];
	        this.configuredStyle = source["configuredStyle"];
	    }
	}

}

export namespace services {
	
	export class LensDTO {
	    id: string;
	    name: string;
	
	    static createFrom(source: any = {}) {
	        return new LensDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	    }
	}
	export class CameraDTO {
	    id: string;
	    name: string;
	
	    static createFrom(source: any = {}) {
	        return new CameraDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	    }
	}
	export class PhotoDTO {
	    id: string;
	    title: string;
	    url: string;
	    thumbnailUrl?: string;
	    originFlag: string;
	    storageProvider: string;
	    storageSourceId?: string;
	    storageKey?: string;
	    width: number;
	    height: number;
	    size?: number;
	    isFeatured: boolean;
	    showFlag: boolean;
	    dominantColors?: string[];
	    fileHash?: string;
	    // Go type: time
	    createdAt: any;
	    cameraId?: string;
	    lensId?: string;
	    camera?: CameraDTO;
	    lens?: LensDTO;
	    cameraMake?: string;
	    cameraModel?: string;
	    lensModel?: string;
	    focalLength?: string;
	    aperture?: string;
	    shutterSpeed?: string;
	    iso?: number;
	    // Go type: time
	    takenAt?: any;
	    orientation?: number;
	    software?: string;
	    gps?: string;
	    category: string;
	    photoType: string;
	    filmRollId?: string;
	    filmRollName?: string;
	
	    static createFrom(source: any = {}) {
	        return new PhotoDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.url = source["url"];
	        this.thumbnailUrl = source["thumbnailUrl"];
	        this.originFlag = source["originFlag"];
	        this.storageProvider = source["storageProvider"];
	        this.storageSourceId = source["storageSourceId"];
	        this.storageKey = source["storageKey"];
	        this.width = source["width"];
	        this.height = source["height"];
	        this.size = source["size"];
	        this.isFeatured = source["isFeatured"];
	        this.showFlag = source["showFlag"];
	        this.dominantColors = source["dominantColors"];
	        this.fileHash = source["fileHash"];
	        this.createdAt = this.convertValues(source["createdAt"], null);
	        this.cameraId = source["cameraId"];
	        this.lensId = source["lensId"];
	        this.camera = this.convertValues(source["camera"], CameraDTO);
	        this.lens = this.convertValues(source["lens"], LensDTO);
	        this.cameraMake = source["cameraMake"];
	        this.cameraModel = source["cameraModel"];
	        this.lensModel = source["lensModel"];
	        this.focalLength = source["focalLength"];
	        this.aperture = source["aperture"];
	        this.shutterSpeed = source["shutterSpeed"];
	        this.iso = source["iso"];
	        this.takenAt = this.convertValues(source["takenAt"], null);
	        this.orientation = source["orientation"];
	        this.software = source["software"];
	        this.gps = source["gps"];
	        this.category = source["category"];
	        this.photoType = source["photoType"];
	        this.filmRollId = source["filmRollId"];
	        this.filmRollName = source["filmRollName"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class AlbumDTO {
	    id: string;
	    name: string;
	    description?: string;
	    coverUrl?: string;
	    location?: string;
	    isPublished: boolean;
	    sortOrder: number;
	    photoCount: number;
	    // Go type: time
	    createdAt: any;
	    // Go type: time
	    updatedAt: any;
	    photos?: PhotoDTO[];
	
	    static createFrom(source: any = {}) {
	        return new AlbumDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.description = source["description"];
	        this.coverUrl = source["coverUrl"];
	        this.location = source["location"];
	        this.isPublished = source["isPublished"];
	        this.sortOrder = source["sortOrder"];
	        this.photoCount = source["photoCount"];
	        this.createdAt = this.convertValues(source["createdAt"], null);
	        this.updatedAt = this.convertValues(source["updatedAt"], null);
	        this.photos = this.convertValues(source["photos"], PhotoDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class BatchDeleteParams {
	    photoIds: string[];
	    deleteOriginal: boolean;
	    deleteThumbnail: boolean;
	    force: boolean;
	
	    static createFrom(source: any = {}) {
	        return new BatchDeleteParams(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.photoIds = source["photoIds"];
	        this.deleteOriginal = source["deleteOriginal"];
	        this.deleteThumbnail = source["deleteThumbnail"];
	        this.force = source["force"];
	    }
	}
	export class BatchResult {
	    success: number;
	    failed: number;
	    errors?: string[];
	
	    static createFrom(source: any = {}) {
	        return new BatchResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.success = source["success"];
	        this.failed = source["failed"];
	        this.errors = source["errors"];
	    }
	}
	export class BlogDTO {
	    id: string;
	    title: string;
	    content: string;
	    contentJson?: number[];
	    category: string;
	    tags: string;
	    isPublished: boolean;
	    // Go type: time
	    createdAt: any;
	    // Go type: time
	    updatedAt: any;
	
	    static createFrom(source: any = {}) {
	        return new BlogDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.content = source["content"];
	        this.contentJson = source["contentJson"];
	        this.category = source["category"];
	        this.tags = source["tags"];
	        this.isPublished = source["isPublished"];
	        this.createdAt = this.convertValues(source["createdAt"], null);
	        this.updatedAt = this.convertValues(source["updatedAt"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class CommentDTO {
	    id: string;
	    photoId: string;
	    author: string;
	    email?: string;
	    avatarUrl?: string;
	    content: string;
	    status: string;
	    ip?: string;
	    // Go type: time
	    createdAt: any;
	    // Go type: time
	    updatedAt: any;
	
	    static createFrom(source: any = {}) {
	        return new CommentDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.photoId = source["photoId"];
	        this.author = source["author"];
	        this.email = source["email"];
	        this.avatarUrl = source["avatarUrl"];
	        this.content = source["content"];
	        this.status = source["status"];
	        this.ip = source["ip"];
	        this.createdAt = this.convertValues(source["createdAt"], null);
	        this.updatedAt = this.convertValues(source["updatedAt"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class CreateAlbumParams {
	    name: string;
	    description: string;
	    coverUrl?: string;
	    location?: string;
	    isPublished: boolean;
	    sortOrder: number;
	
	    static createFrom(source: any = {}) {
	        return new CreateAlbumParams(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.description = source["description"];
	        this.coverUrl = source["coverUrl"];
	        this.location = source["location"];
	        this.isPublished = source["isPublished"];
	        this.sortOrder = source["sortOrder"];
	    }
	}
	export class CreateBlogParams {
	    title: string;
	    content: string;
	    contentJson?: number[];
	    category: string;
	    tags: string;
	    isPublished: boolean;
	
	    static createFrom(source: any = {}) {
	        return new CreateBlogParams(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.title = source["title"];
	        this.content = source["content"];
	        this.contentJson = source["contentJson"];
	        this.category = source["category"];
	        this.tags = source["tags"];
	        this.isPublished = source["isPublished"];
	    }
	}
	export class CreateFilmRollParams {
	    name: string;
	    brand: string;
	    format: string;
	    iso: number;
	    frameCount: number;
	    notes?: string;
	    // Go type: time
	    shootDate?: any;
	    // Go type: time
	    endDate?: any;
	
	    static createFrom(source: any = {}) {
	        return new CreateFilmRollParams(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.brand = source["brand"];
	        this.format = source["format"];
	        this.iso = source["iso"];
	        this.frameCount = source["frameCount"];
	        this.notes = source["notes"];
	        this.shootDate = this.convertValues(source["shootDate"], null);
	        this.endDate = this.convertValues(source["endDate"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class CreateFriendParams {
	    name: string;
	    url: string;
	    description: string;
	    avatar: string;
	    featured: boolean;
	    sortOrder: number;
	    isActive: boolean;
	
	    static createFrom(source: any = {}) {
	        return new CreateFriendParams(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.url = source["url"];
	        this.description = source["description"];
	        this.avatar = source["avatar"];
	        this.featured = source["featured"];
	        this.sortOrder = source["sortOrder"];
	        this.isActive = source["isActive"];
	    }
	}
	export class CreateStoryParams {
	    title: string;
	    content: string;
	    contentJson?: number[];
	    isPublished: boolean;
	    photoIds?: string[];
	    coverPhotoId?: string;
	    coverCrop?: number[];
	    // Go type: time
	    storyDate?: any;
	
	    static createFrom(source: any = {}) {
	        return new CreateStoryParams(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.title = source["title"];
	        this.content = source["content"];
	        this.contentJson = source["contentJson"];
	        this.isPublished = source["isPublished"];
	        this.photoIds = source["photoIds"];
	        this.coverPhotoId = source["coverPhotoId"];
	        this.coverCrop = source["coverCrop"];
	        this.storyDate = this.convertValues(source["storyDate"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class DeletePhotoParams {
	    deleteOriginal: boolean;
	    deleteThumbnail: boolean;
	    force: boolean;
	
	    static createFrom(source: any = {}) {
	        return new DeletePhotoParams(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.deleteOriginal = source["deleteOriginal"];
	        this.deleteThumbnail = source["deleteThumbnail"];
	        this.force = source["force"];
	    }
	}
	export class DuplicateInfo {
	    id: string;
	    title: string;
	    thumbnailUrl?: string;
	    url?: string;
	    createdAt?: string;
	
	    static createFrom(source: any = {}) {
	        return new DuplicateInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.thumbnailUrl = source["thumbnailUrl"];
	        this.url = source["url"];
	        this.createdAt = source["createdAt"];
	    }
	}
	export class DuplicateCheckResult {
	    duplicates: Record<string, DuplicateInfo>;
	    hasDuplicates: boolean;
	
	    static createFrom(source: any = {}) {
	        return new DuplicateCheckResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.duplicates = this.convertValues(source["duplicates"], DuplicateInfo, true);
	        this.hasDuplicates = source["hasDuplicates"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class EditorAiConversationCreateInput {
	    scopeId: string;
	    title?: string;
	    systemPrompt?: string;
	
	    static createFrom(source: any = {}) {
	        return new EditorAiConversationCreateInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.scopeId = source["scopeId"];
	        this.title = source["title"];
	        this.systemPrompt = source["systemPrompt"];
	    }
	}
	export class EditorAiConversationDTO {
	    id: string;
	    scopeId: string;
	    title?: string;
	    summary?: string;
	    lastModel?: string;
	    systemPrompt?: string;
	    createdAt: string;
	    updatedAt: string;
	
	    static createFrom(source: any = {}) {
	        return new EditorAiConversationDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.scopeId = source["scopeId"];
	        this.title = source["title"];
	        this.summary = source["summary"];
	        this.lastModel = source["lastModel"];
	        this.systemPrompt = source["systemPrompt"];
	        this.createdAt = source["createdAt"];
	        this.updatedAt = source["updatedAt"];
	    }
	}
	export class EditorAiConversationPageDTO {
	    items: EditorAiConversationDTO[];
	    hasMore: boolean;
	
	    static createFrom(source: any = {}) {
	        return new EditorAiConversationPageDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.items = this.convertValues(source["items"], EditorAiConversationDTO);
	        this.hasMore = source["hasMore"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class EditorAiConversationUpdateInput {
	    title?: string;
	    systemPrompt?: string;
	
	    static createFrom(source: any = {}) {
	        return new EditorAiConversationUpdateInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.title = source["title"];
	        this.systemPrompt = source["systemPrompt"];
	    }
	}
	export class EditorAiMessageDTO {
	    id: string;
	    conversationId: string;
	    role: string;
	    content: string;
	    status: string;
	    model?: string;
	    action?: string;
	    metadata?: any;
	    error?: string;
	    createdAt: string;
	
	    static createFrom(source: any = {}) {
	        return new EditorAiMessageDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.conversationId = source["conversationId"];
	        this.role = source["role"];
	        this.content = source["content"];
	        this.status = source["status"];
	        this.model = source["model"];
	        this.action = source["action"];
	        this.metadata = source["metadata"];
	        this.error = source["error"];
	        this.createdAt = source["createdAt"];
	    }
	}
	export class EditorAiConversationWithMessagesDTO {
	    id: string;
	    scopeId: string;
	    title?: string;
	    summary?: string;
	    lastModel?: string;
	    systemPrompt?: string;
	    createdAt: string;
	    updatedAt: string;
	    messages: EditorAiMessageDTO[];
	    hasMoreMessages: boolean;
	
	    static createFrom(source: any = {}) {
	        return new EditorAiConversationWithMessagesDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.scopeId = source["scopeId"];
	        this.title = source["title"];
	        this.summary = source["summary"];
	        this.lastModel = source["lastModel"];
	        this.systemPrompt = source["systemPrompt"];
	        this.createdAt = source["createdAt"];
	        this.updatedAt = source["updatedAt"];
	        this.messages = this.convertValues(source["messages"], EditorAiMessageDTO);
	        this.hasMoreMessages = source["hasMoreMessages"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class EditorAiMessageAppendInput {
	    conversationId: string;
	    role: string;
	    content: string;
	    status?: string;
	    model?: string;
	    action?: string;
	    metadata?: number[];
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new EditorAiMessageAppendInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.conversationId = source["conversationId"];
	        this.role = source["role"];
	        this.content = source["content"];
	        this.status = source["status"];
	        this.model = source["model"];
	        this.action = source["action"];
	        this.metadata = source["metadata"];
	        this.error = source["error"];
	    }
	}
	
	export class EditorAiMessageFinishInput {
	    messageId: string;
	    status: string;
	    content?: string;
	    model?: string;
	    metadata?: number[];
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new EditorAiMessageFinishInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.messageId = source["messageId"];
	        this.status = source["status"];
	        this.content = source["content"];
	        this.model = source["model"];
	        this.metadata = source["metadata"];
	        this.error = source["error"];
	    }
	}
	export class EditorAiTaskStateUpdateInput {
	    messageId: string;
	    state: string;
	
	    static createFrom(source: any = {}) {
	        return new EditorAiTaskStateUpdateInput(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.messageId = source["messageId"];
	        this.state = source["state"];
	    }
	}
	export class FilmPhotoDTO {
	    id: string;
	    filmRollId: string;
	    photoId: string;
	    frameNumber: number;
	    // Go type: time
	    createdAt: any;
	    photo?: PhotoDTO;
	
	    static createFrom(source: any = {}) {
	        return new FilmPhotoDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.filmRollId = source["filmRollId"];
	        this.photoId = source["photoId"];
	        this.frameNumber = source["frameNumber"];
	        this.createdAt = this.convertValues(source["createdAt"], null);
	        this.photo = this.convertValues(source["photo"], PhotoDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class FilmRollDTO {
	    id: string;
	    name: string;
	    brand: string;
	    format: string;
	    iso: number;
	    frameCount: number;
	    notes?: string;
	    // Go type: time
	    shootDate?: any;
	    // Go type: time
	    endDate?: any;
	    photoCount: number;
	    // Go type: time
	    createdAt: any;
	    // Go type: time
	    updatedAt: any;
	    filmPhotos?: FilmPhotoDTO[];
	
	    static createFrom(source: any = {}) {
	        return new FilmRollDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.brand = source["brand"];
	        this.format = source["format"];
	        this.iso = source["iso"];
	        this.frameCount = source["frameCount"];
	        this.notes = source["notes"];
	        this.shootDate = this.convertValues(source["shootDate"], null);
	        this.endDate = this.convertValues(source["endDate"], null);
	        this.photoCount = source["photoCount"];
	        this.createdAt = this.convertValues(source["createdAt"], null);
	        this.updatedAt = this.convertValues(source["updatedAt"], null);
	        this.filmPhotos = this.convertValues(source["filmPhotos"], FilmPhotoDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class FixMissingPhotosResult {
	    deleted: number;
	
	    static createFrom(source: any = {}) {
	        return new FixMissingPhotosResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.deleted = source["deleted"];
	    }
	}
	export class FriendDTO {
	    id: string;
	    name: string;
	    url: string;
	    description?: string;
	    avatar?: string;
	    featured: boolean;
	    sortOrder: number;
	    isActive: boolean;
	    // Go type: time
	    createdAt: any;
	    // Go type: time
	    updatedAt: any;
	
	    static createFrom(source: any = {}) {
	        return new FriendDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.url = source["url"];
	        this.description = source["description"];
	        this.avatar = source["avatar"];
	        this.featured = source["featured"];
	        this.sortOrder = source["sortOrder"];
	        this.isActive = source["isActive"];
	        this.createdAt = this.convertValues(source["createdAt"], null);
	        this.updatedAt = this.convertValues(source["updatedAt"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class LinuxDoAuthUrlDTO {
	    url: string;
	    state: string;
	
	    static createFrom(source: any = {}) {
	        return new LinuxDoAuthUrlDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.url = source["url"];
	        this.state = source["state"];
	    }
	}
	export class LinuxDoBindingDTO {
	    username: string;
	    avatarUrl?: string;
	    trustLevel?: number;
	
	    static createFrom(source: any = {}) {
	        return new LinuxDoBindingDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.username = source["username"];
	        this.avatarUrl = source["avatarUrl"];
	        this.trustLevel = source["trustLevel"];
	    }
	}
	export class ListCommentsParams {
	    status: string;
	    photoId: string;
	    page: number;
	    limit: number;
	
	    static createFrom(source: any = {}) {
	        return new ListCommentsParams(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.status = source["status"];
	        this.photoId = source["photoId"];
	        this.page = source["page"];
	        this.limit = source["limit"];
	    }
	}
	export class ListPhotosParams {
	    category: string;
	    albumId: string;
	    cameraId: string;
	    lensId: string;
	    search: string;
	    photoType?: string;
	    channel?: string;
	    featured?: boolean;
	    showFlag?: boolean;
	    sortBy: string;
	    sortOrder: string;
	    page: number;
	    pageSize: number;
	    all: boolean;
	
	    static createFrom(source: any = {}) {
	        return new ListPhotosParams(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.category = source["category"];
	        this.albumId = source["albumId"];
	        this.cameraId = source["cameraId"];
	        this.lensId = source["lensId"];
	        this.search = source["search"];
	        this.photoType = source["photoType"];
	        this.channel = source["channel"];
	        this.featured = source["featured"];
	        this.showFlag = source["showFlag"];
	        this.sortBy = source["sortBy"];
	        this.sortOrder = source["sortOrder"];
	        this.page = source["page"];
	        this.pageSize = source["pageSize"];
	        this.all = source["all"];
	    }
	}
	export class LogEntry {
	    id: string;
	    // Go type: time
	    timestamp: any;
	    level: string;
	    category: string;
	    action: string;
	    message: string;
	    details?: string;
	
	    static createFrom(source: any = {}) {
	        return new LogEntry(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.timestamp = this.convertValues(source["timestamp"], null);
	        this.level = source["level"];
	        this.category = source["category"];
	        this.action = source["action"];
	        this.message = source["message"];
	        this.details = source["details"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class UserInfo {
	    id?: string;
	    username: string;
	    isAdmin: boolean;
	    avatarUrl?: string;
	
	    static createFrom(source: any = {}) {
	        return new UserInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.username = source["username"];
	        this.isAdmin = source["isAdmin"];
	        this.avatarUrl = source["avatarUrl"];
	    }
	}
	export class LoginResult {
	    token: string;
	    user: UserInfo;
	    server: string;
	
	    static createFrom(source: any = {}) {
	        return new LoginResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.token = source["token"];
	        this.user = this.convertValues(source["user"], UserInfo);
	        this.server = source["server"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class RecentBlogDTO {
	    id: string;
	    title: string;
	    createdAt: string;
	    isPublished: boolean;
	
	    static createFrom(source: any = {}) {
	        return new RecentBlogDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.createdAt = source["createdAt"];
	        this.isPublished = source["isPublished"];
	    }
	}
	export class RecentStoryDTO {
	    id: string;
	    title: string;
	    createdAt: string;
	    isPublished: boolean;
	
	    static createFrom(source: any = {}) {
	        return new RecentStoryDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.createdAt = source["createdAt"];
	        this.isPublished = source["isPublished"];
	    }
	}
	export class RecentPhotoDTO {
	    id: string;
	    title: string;
	    url: string;
	    thumbnailUrl?: string;
	    createdAt: string;
	
	    static createFrom(source: any = {}) {
	        return new RecentPhotoDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.url = source["url"];
	        this.thumbnailUrl = source["thumbnailUrl"];
	        this.createdAt = source["createdAt"];
	    }
	}
	export class OverviewDTO {
	    photoCount: number;
	    digitalCount: number;
	    filmCount: number;
	    albumCount: number;
	    storyCount: number;
	    blogCount: number;
	    filmRollCount: number;
	    friendCount: number;
	    commentCount: number;
	    cameraCount: number;
	    lensCount: number;
	    categoryCount: number;
	    featuredCount: number;
	    hiddenCount: number;
	    pendingComments: number;
	    approvedComments: number;
	    rejectedComments: number;
	    totalSize: number;
	    publishedAlbums: number;
	    draftAlbums: number;
	    publishedStories: number;
	    draftStories: number;
	    publishedBlogs: number;
	    draftBlogs: number;
	    recentPhotos: RecentPhotoDTO[];
	    recentStories: RecentStoryDTO[];
	    recentBlogs: RecentBlogDTO[];
	    photosThisMonth: number;
	    photosThisYear: number;
	
	    static createFrom(source: any = {}) {
	        return new OverviewDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.photoCount = source["photoCount"];
	        this.digitalCount = source["digitalCount"];
	        this.filmCount = source["filmCount"];
	        this.albumCount = source["albumCount"];
	        this.storyCount = source["storyCount"];
	        this.blogCount = source["blogCount"];
	        this.filmRollCount = source["filmRollCount"];
	        this.friendCount = source["friendCount"];
	        this.commentCount = source["commentCount"];
	        this.cameraCount = source["cameraCount"];
	        this.lensCount = source["lensCount"];
	        this.categoryCount = source["categoryCount"];
	        this.featuredCount = source["featuredCount"];
	        this.hiddenCount = source["hiddenCount"];
	        this.pendingComments = source["pendingComments"];
	        this.approvedComments = source["approvedComments"];
	        this.rejectedComments = source["rejectedComments"];
	        this.totalSize = source["totalSize"];
	        this.publishedAlbums = source["publishedAlbums"];
	        this.draftAlbums = source["draftAlbums"];
	        this.publishedStories = source["publishedStories"];
	        this.draftStories = source["draftStories"];
	        this.publishedBlogs = source["publishedBlogs"];
	        this.draftBlogs = source["draftBlogs"];
	        this.recentPhotos = this.convertValues(source["recentPhotos"], RecentPhotoDTO);
	        this.recentStories = this.convertValues(source["recentStories"], RecentStoryDTO);
	        this.recentBlogs = this.convertValues(source["recentBlogs"], RecentBlogDTO);
	        this.photosThisMonth = source["photosThisMonth"];
	        this.photosThisYear = source["photosThisYear"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class PaginationMeta {
	    total: number;
	    page: number;
	    pageSize: number;
	    totalPages: number;
	    hasMore: boolean;
	
	    static createFrom(source: any = {}) {
	        return new PaginationMeta(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.total = source["total"];
	        this.page = source["page"];
	        this.pageSize = source["pageSize"];
	        this.totalPages = source["totalPages"];
	        this.hasMore = source["hasMore"];
	    }
	}
	export class PaginatedResponse_mo_gallery_desktop_services_CommentDTO_ {
	    data: CommentDTO[];
	    meta: PaginationMeta;
	
	    static createFrom(source: any = {}) {
	        return new PaginatedResponse_mo_gallery_desktop_services_CommentDTO_(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.data = this.convertValues(source["data"], CommentDTO);
	        this.meta = this.convertValues(source["meta"], PaginationMeta);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class PaginatedResponse_mo_gallery_desktop_services_PhotoDTO_ {
	    data: PhotoDTO[];
	    meta: PaginationMeta;
	
	    static createFrom(source: any = {}) {
	        return new PaginatedResponse_mo_gallery_desktop_services_PhotoDTO_(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.data = this.convertValues(source["data"], PhotoDTO);
	        this.meta = this.convertValues(source["meta"], PaginationMeta);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	export class PreparedFile {
	    assetId?: string;
	    filePath: string;
	    fileName: string;
	    fileSize: number;
	    hash: string;
	    exif?: image.ExifData;
	    error?: string;
	
	    static createFrom(source: any = {}) {
	        return new PreparedFile(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.assetId = source["assetId"];
	        this.filePath = source["filePath"];
	        this.fileName = source["fileName"];
	        this.fileSize = source["fileSize"];
	        this.hash = source["hash"];
	        this.exif = this.convertValues(source["exif"], image.ExifData);
	        this.error = source["error"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	
	
	export class StorageCleanupResult {
	    deleted: number;
	    failed: number;
	    errors: string[];
	
	    static createFrom(source: any = {}) {
	        return new StorageCleanupResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.deleted = source["deleted"];
	        this.failed = source["failed"];
	        this.errors = source["errors"];
	    }
	}
	export class StorageFileDTO {
	    key: string;
	    url: string;
	    size: number;
	    lastModified: string;
	    status: string;
	    photoId?: string;
	    photoTitle?: string;
	    missingType?: string;
	    hasThumb?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new StorageFileDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.key = source["key"];
	        this.url = source["url"];
	        this.size = source["size"];
	        this.lastModified = source["lastModified"];
	        this.status = source["status"];
	        this.photoId = source["photoId"];
	        this.photoTitle = source["photoTitle"];
	        this.missingType = source["missingType"];
	        this.hasThumb = source["hasThumb"];
	    }
	}
	export class StorageScanParams {
	    provider: string;
	    status?: string;
	    search?: string;
	
	    static createFrom(source: any = {}) {
	        return new StorageScanParams(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.provider = source["provider"];
	        this.status = source["status"];
	        this.search = source["search"];
	    }
	}
	export class StorageScanStats {
	    total: number;
	    linked: number;
	    orphan: number;
	    missing: number;
	    missingOriginal: number;
	    missingThumbnail: number;
	
	    static createFrom(source: any = {}) {
	        return new StorageScanStats(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.total = source["total"];
	        this.linked = source["linked"];
	        this.orphan = source["orphan"];
	        this.missing = source["missing"];
	        this.missingOriginal = source["missingOriginal"];
	        this.missingThumbnail = source["missingThumbnail"];
	    }
	}
	export class StorageScanResult {
	    files: StorageFileDTO[];
	    stats: StorageScanStats;
	
	    static createFrom(source: any = {}) {
	        return new StorageScanResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.files = this.convertValues(source["files"], StorageFileDTO);
	        this.stats = this.convertValues(source["stats"], StorageScanStats);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	
	export class StoryAiModelOption {
	    id: string;
	    label: string;
	    provider: string;
	    model: string;
	    capabilities?: string[];
	    vision: boolean;
	    tools: boolean;
	    structuredOutput: boolean;
	    contextWindow: number;
	
	    static createFrom(source: any = {}) {
	        return new StoryAiModelOption(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.label = source["label"];
	        this.provider = source["provider"];
	        this.model = source["model"];
	        this.capabilities = source["capabilities"];
	        this.vision = source["vision"];
	        this.tools = source["tools"];
	        this.structuredOutput = source["structuredOutput"];
	        this.contextWindow = source["contextWindow"];
	    }
	}
	export class StoryAiModelsResponseDTO {
	    defaultModel: string;
	    defaultImageModel?: string;
	    models: StoryAiModelOption[];
	
	    static createFrom(source: any = {}) {
	        return new StoryAiModelsResponseDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.defaultModel = source["defaultModel"];
	        this.defaultImageModel = source["defaultImageModel"];
	        this.models = this.convertValues(source["models"], StoryAiModelOption);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class StoryDTO {
	    id: string;
	    title: string;
	    content: string;
	    contentJson?: number[];
	    coverPhotoId?: string;
	    coverCrop?: number[];
	    isPublished: boolean;
	    // Go type: time
	    storyDate?: any;
	    // Go type: time
	    createdAt: any;
	    // Go type: time
	    updatedAt: any;
	    photos?: PhotoDTO[];
	
	    static createFrom(source: any = {}) {
	        return new StoryDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.title = source["title"];
	        this.content = source["content"];
	        this.contentJson = source["contentJson"];
	        this.coverPhotoId = source["coverPhotoId"];
	        this.coverCrop = source["coverCrop"];
	        this.isPublished = source["isPublished"];
	        this.storyDate = this.convertValues(source["storyDate"], null);
	        this.createdAt = this.convertValues(source["createdAt"], null);
	        this.updatedAt = this.convertValues(source["updatedAt"], null);
	        this.photos = this.convertValues(source["photos"], PhotoDTO);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class UpdateAlbumParams {
	    name?: string;
	    description?: string;
	    coverUrl?: string;
	    location?: string;
	    isPublished?: boolean;
	    sortOrder?: number;
	
	    static createFrom(source: any = {}) {
	        return new UpdateAlbumParams(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.description = source["description"];
	        this.coverUrl = source["coverUrl"];
	        this.location = source["location"];
	        this.isPublished = source["isPublished"];
	        this.sortOrder = source["sortOrder"];
	    }
	}
	export class UpdateAsset {
	    name: string;
	    downloadUrl: string;
	    size: number;
	    digest: string;
	    platform: string;
	    arch: string;
	    installMode: string;
	
	    static createFrom(source: any = {}) {
	        return new UpdateAsset(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.downloadUrl = source["downloadUrl"];
	        this.size = source["size"];
	        this.digest = source["digest"];
	        this.platform = source["platform"];
	        this.arch = source["arch"];
	        this.installMode = source["installMode"];
	    }
	}
	export class UpdateBlogParams {
	    title?: string;
	    content?: string;
	    contentJson?: number[];
	    category?: string;
	    tags?: string;
	    isPublished?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new UpdateBlogParams(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.title = source["title"];
	        this.content = source["content"];
	        this.contentJson = source["contentJson"];
	        this.category = source["category"];
	        this.tags = source["tags"];
	        this.isPublished = source["isPublished"];
	    }
	}
	export class UpdateDownloadResult {
	    path: string;
	    name: string;
	    installMode: string;
	
	    static createFrom(source: any = {}) {
	        return new UpdateDownloadResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.path = source["path"];
	        this.name = source["name"];
	        this.installMode = source["installMode"];
	    }
	}
	export class UpdateFilmRollParams {
	    name?: string;
	    brand?: string;
	    format?: string;
	    iso?: number;
	    frameCount?: number;
	    notes?: string;
	    // Go type: time
	    shootDate?: any;
	    // Go type: time
	    endDate?: any;
	
	    static createFrom(source: any = {}) {
	        return new UpdateFilmRollParams(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.brand = source["brand"];
	        this.format = source["format"];
	        this.iso = source["iso"];
	        this.frameCount = source["frameCount"];
	        this.notes = source["notes"];
	        this.shootDate = this.convertValues(source["shootDate"], null);
	        this.endDate = this.convertValues(source["endDate"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class UpdateFriendParams {
	    name?: string;
	    url?: string;
	    description?: string;
	    avatar?: string;
	    featured?: boolean;
	    sortOrder?: number;
	    isActive?: boolean;
	
	    static createFrom(source: any = {}) {
	        return new UpdateFriendParams(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.name = source["name"];
	        this.url = source["url"];
	        this.description = source["description"];
	        this.avatar = source["avatar"];
	        this.featured = source["featured"];
	        this.sortOrder = source["sortOrder"];
	        this.isActive = source["isActive"];
	    }
	}
	export class UpdateInfo {
	    currentVersion: string;
	    latestVersion: string;
	    updateAvailable: boolean;
	    releaseUrl: string;
	    publishedAt: string;
	    notes: string;
	    asset?: UpdateAsset;
	
	    static createFrom(source: any = {}) {
	        return new UpdateInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.currentVersion = source["currentVersion"];
	        this.latestVersion = source["latestVersion"];
	        this.updateAvailable = source["updateAvailable"];
	        this.releaseUrl = source["releaseUrl"];
	        this.publishedAt = source["publishedAt"];
	        this.notes = source["notes"];
	        this.asset = this.convertValues(source["asset"], UpdateAsset);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class UpdatePhotoParams {
	    title?: string;
	    isFeatured?: boolean;
	    showFlag?: boolean;
	    // Go type: time
	    takenAt?: any;
	    category?: string;
	
	    static createFrom(source: any = {}) {
	        return new UpdatePhotoParams(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.title = source["title"];
	        this.isFeatured = source["isFeatured"];
	        this.showFlag = source["showFlag"];
	        this.takenAt = this.convertValues(source["takenAt"], null);
	        this.category = source["category"];
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class UpdateStoryParams {
	    title?: string;
	    content?: string;
	    contentJson?: number[];
	    isPublished?: boolean;
	    coverPhotoId?: string;
	    coverCrop?: number[];
	    // Go type: time
	    storyDate?: any;
	
	    static createFrom(source: any = {}) {
	        return new UpdateStoryParams(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.title = source["title"];
	        this.content = source["content"];
	        this.contentJson = source["contentJson"];
	        this.isPublished = source["isPublished"];
	        this.coverPhotoId = source["coverPhotoId"];
	        this.coverCrop = source["coverCrop"];
	        this.storyDate = this.convertValues(source["storyDate"], null);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class UploadResult {
	    filePath: string;
	    success: boolean;
	    photo?: PhotoDTO;
	    error?: string;
	    isDuplicate?: boolean;
	    existing?: DuplicateInfo;
	
	    static createFrom(source: any = {}) {
	        return new UploadResult(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.filePath = source["filePath"];
	        this.success = source["success"];
	        this.photo = this.convertValues(source["photo"], PhotoDTO);
	        this.error = source["error"];
	        this.isDuplicate = source["isDuplicate"];
	        this.existing = this.convertValues(source["existing"], DuplicateInfo);
	    }
	
		convertValues(a: any, classs: any, asMap: boolean = false): any {
		    if (!a) {
		        return a;
		    }
		    if (a.slice && a.map) {
		        return (a as any[]).map(elem => this.convertValues(elem, classs));
		    } else if ("object" === typeof a) {
		        if (asMap) {
		            for (const key of Object.keys(a)) {
		                a[key] = new classs(a[key]);
		            }
		            return a;
		        }
		        return new classs(a);
		    }
		    return a;
		}
	}
	export class UploadSettings {
	    title: string;
	    categories: string[];
	    storageSourceId: string;
	    storageProvider: string;
	    storagePath: string;
	    storagePathFull: boolean;
	    showFlag: boolean;
	    compressEnabled: boolean;
	    maxSizeMB: number;
	    stripGPS: boolean;
	    filmRollId: string;
	    originFlag: string;
	
	    static createFrom(source: any = {}) {
	        return new UploadSettings(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.title = source["title"];
	        this.categories = source["categories"];
	        this.storageSourceId = source["storageSourceId"];
	        this.storageProvider = source["storageProvider"];
	        this.storagePath = source["storagePath"];
	        this.storagePathFull = source["storagePathFull"];
	        this.showFlag = source["showFlag"];
	        this.compressEnabled = source["compressEnabled"];
	        this.maxSizeMB = source["maxSizeMB"];
	        this.stripGPS = source["stripGPS"];
	        this.filmRollId = source["filmRollId"];
	        this.originFlag = source["originFlag"];
	    }
	}
	
	export class ZineCJKFontInfo {
	    found: boolean;
	    path: string;
	    postscriptName: string;
	
	    static createFrom(source: any = {}) {
	        return new ZineCJKFontInfo(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.found = source["found"];
	        this.path = source["path"];
	        this.postscriptName = source["postscriptName"];
	    }
	}

}

export namespace types {
	
	export class StorageSourceDTO {
	    id: string;
	    name: string;
	    type: string;
	    accessKey?: string;
	    secretKey?: string;
	    bucket?: string;
	    region?: string;
	    endpoint?: string;
	    publicUrl?: string;
	    basePath?: string;
	    branch?: string;
	    accessMethod?: string;
	
	    static createFrom(source: any = {}) {
	        return new StorageSourceDTO(source);
	    }
	
	    constructor(source: any = {}) {
	        if ('string' === typeof source) source = JSON.parse(source);
	        this.id = source["id"];
	        this.name = source["name"];
	        this.type = source["type"];
	        this.accessKey = source["accessKey"];
	        this.secretKey = source["secretKey"];
	        this.bucket = source["bucket"];
	        this.region = source["region"];
	        this.endpoint = source["endpoint"];
	        this.publicUrl = source["publicUrl"];
	        this.basePath = source["basePath"];
	        this.branch = source["branch"];
	        this.accessMethod = source["accessMethod"];
	    }
	}

}

