class ApiException implements Exception {
  ApiException({
    required this.message,
    this.statusCode,
    this.code,
    this.existingPhotoId,
  });

  final String message;
  final int? statusCode;
  final String? code;
  final String? existingPhotoId;

  bool get isDuplicate => code == 'DUPLICATE_PHOTO' || statusCode == 409;
  bool get isUnauthorized => statusCode == 401;
  bool get isPayloadTooLarge => statusCode == 413;

  @override
  String toString() => 'ApiException($statusCode, $code): $message';
}
