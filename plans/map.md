

开源仓库 [Afilmory/afilmory](https://github.com/Afilmory/afilmory)。它的“地图 + 坐标”实现，核心其实是两条线：

1. 照片里的 GPS 坐标来自 EXIF
2. 前端用 MapLibre 把这些坐标渲染成地图点位

**实现链路**

- 构建阶段，`packages/builder/src/image/exif.ts` 会用 `exiftool-vendored` 读取照片 EXIF，明确提取 `GPSLatitude`、`GPSLongitude`、`GPSLatitudeRef`、`GPSLongitudeRef`、`GPSAltitude` 等字段。
- 这些字段进入 `PhotoManifestItem.exif`，类型定义在 [afilmory-src\packages\typing\src\photo.ts](/D:/work/_tmp/afilmory-src/packages/typing/src/photo.ts)。
- 前端启动时，manifest 会被注入到页面里。相关逻辑在 [afilmory-src\apps\web\plugins\vite\manifest-inject.ts](/D:/work/_tmp/afilmory-src/apps/web/plugins/vite/manifest-inject.ts) 和 [afilmory-src\packages\data\src\index.ts](/D:/work/_tmp/afilmory-src/packages/data/src/index.ts)。
- 地图页 `MapSection` 从 `photoLoader.getPhotos()` 读取所有照片，再把有 GPS 的照片转成 marker。核心在 [afilmory-src\apps\web\src\modules\map\MapSection.tsx](/D:/work/_tmp/afilmory-src/apps/web/src/modules/map/MapSection.tsx) 和 [afilmory-src\apps\web\src\lib\map-utils.ts](/D:/work/_tmp/afilmory-src/apps/web/src/lib/map-utils.ts)。

**坐标是怎么处理的**
- `convertExifGPSToDecimal()` 会把 EXIF 坐标转成十进制度。
- 它会根据 `GPSLatitudeRef` / `GPSLongitudeRef` 处理南纬、西经负号。
- 还会校验范围是否合法：纬度 `-90~90`，经度 `-180~180`。
- 转完后生成 `PhotoMarker`，里面保存 `latitude`、`longitude`、`altitude` 和对应照片对象。

**地图是怎么画出来的**
- 地图底层是 `react-map-gl/maplibre` + `maplibre-gl`，主组件在 [afilmory-src\apps\web\src\components\ui\map\MapLibre.tsx](/D:/work/_tmp/afilmory-src/apps/web/src/components/ui/map/MapLibre.tsx)。
- 配置里 `map: ["maplibre"]`、`mapStyle: "builtin"`、`mapProjection: "mercator"`，说明默认就是 MapLibre。
- 地图会自动计算所有点的边界并 `fitBounds`，首次进入自动缩放到所有照片范围。
- 缩放较小时会做聚合，逻辑在 [afilmory-src\apps\web\src\components\ui\map\shared\clustering.ts](/D:/work/_tmp/afilmory-src/apps/web/src/components/ui/map/shared/clustering.ts)。
- 单个点位用自定义 marker 展示，点开会显示该照片预览、拍摄时间、相机型号、经纬度。实现见 [afilmory-src\apps\web\src\components\ui\map\shared\PhotoMarkerPin.tsx](/D:/work/_tmp/afilmory-src/apps/web/src/components/ui/map/shared/PhotoMarkerPin.tsx)。

**有没有地理编码**
- 有，而且是“可选增强”，不是地图展示的硬依赖。
- `packages/builder/src/plugins/geocoding.ts` 提供 geocoding plugin。
- `packages/builder/src/photo/geocoding.ts` 支持两种反向地理编码提供者：
  - `Mapbox`
  - `OpenStreetMap Nominatim`
- 这个插件会把经纬度反查成 `location.country`、`location.city`、`locationName`。
- 但当前地图页本身主要还是直接用 `exif.GPSLatitude/GPSLongitude` 来落点，不依赖 `location` 字段。
