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
	    dominantColors?: number[];
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
	    coverUrl: string;
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
	    notes: string;
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
	    photos?: PhotoDTO[];
	
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
	export class StoryDTO {
	    id: string;
	    title: string;
	    content: string;
	    contentJson?: number[];
	    coverPhotoId?: string;
	    coverCrop?: number[];
	    isPublished: boolean;
	    // Go type: time
	    storyDate: any;
	    // Go type: time
	    createdAt: any;
	    // Go type: time
	    updatedAt: any;
	    photoCount: number;
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
	        this.photoCount = source["photoCount"];
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
	        this.isPublished = source["isPublished"];
	        this.sortOrder = source["sortOrder"];
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

