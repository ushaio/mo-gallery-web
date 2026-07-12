import 'package:dio/dio.dart';

import 'api_exception.dart';
import 'envelope.dart';

class ApiClient {
  ApiClient({
    required String baseUrl,
    String? token,
    void Function()? onUnauthorized,
    Dio? dio,
  })  : _token = token,
        _onUnauthorized = onUnauthorized,
        _dio = dio ??
            Dio(
              BaseOptions(
                baseUrl: normalizeApiBase(baseUrl),
                connectTimeout: const Duration(seconds: 30),
                receiveTimeout: const Duration(minutes: 5),
                sendTimeout: const Duration(minutes: 5),
                headers: const {
                  'Accept': 'application/json',
                },
              ),
            ) {
    _dio.interceptors.add(
      InterceptorsWrapper(
        onRequest: (options, handler) {
          final token = _token;
          if (token != null && token.isNotEmpty) {
            options.headers['Authorization'] = 'Bearer $token';
          }
          handler.next(options);
        },
        onError: (error, handler) {
          final status = error.response?.statusCode;
          if (status == 401) {
            _onUnauthorized?.call();
          }
          handler.next(error);
        },
      ),
    );
  }

  final Dio _dio;
  String? _token;
  final void Function()? _onUnauthorized;

  Dio get dio => _dio;

  void updateBaseUrl(String baseUrl) {
    _dio.options.baseUrl = normalizeApiBase(baseUrl);
  }

  void updateToken(String? token) {
    _token = token;
  }

  Future<Map<String, dynamic>> getJson(
    String path, {
    Map<String, dynamic>? query,
  }) async {
    try {
      final response = await _dio.get<dynamic>(
        path,
        queryParameters: query,
      );
      return _asMap(response.data);
    } on DioException catch (e) {
      throw _mapDio(e);
    }
  }

  Future<Map<String, dynamic>> postJson(
    String path, {
    Object? body,
  }) async {
    try {
      final response = await _dio.post<dynamic>(
        path,
        data: body,
        options: Options(contentType: Headers.jsonContentType),
      );
      return _asMap(response.data);
    } on DioException catch (e) {
      throw _mapDio(e);
    }
  }

  Future<Map<String, dynamic>> postMultipart(
    String path, {
    required FormData form,
    void Function(int, int)? onSendProgress,
  }) async {
    try {
      final response = await _dio.post<dynamic>(
        path,
        data: form,
        onSendProgress: onSendProgress,
      );
      return _asMap(response.data);
    } on DioException catch (e) {
      throw _mapDio(e);
    }
  }

  Map<String, dynamic> _asMap(Object? data) {
    if (data is Map<String, dynamic>) return data;
    if (data is Map) return Map<String, dynamic>.from(data);
    throw ApiException(message: 'Unexpected response body');
  }

  ApiException _mapDio(DioException e) {
    final status = e.response?.statusCode;
    final data = e.response?.data;
    if (status != null) {
      return apiExceptionFromBody(status, data);
    }
    if (e.type == DioExceptionType.connectionTimeout ||
        e.type == DioExceptionType.sendTimeout ||
        e.type == DioExceptionType.receiveTimeout) {
      return ApiException(message: 'timeout', code: 'TIMEOUT');
    }
    if (e.type == DioExceptionType.connectionError) {
      return ApiException(message: 'network', code: 'NETWORK');
    }
    return ApiException(message: e.message ?? 'Request failed');
  }
}
