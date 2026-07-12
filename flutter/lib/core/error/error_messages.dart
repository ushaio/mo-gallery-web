import 'package:dio/dio.dart';

import '../api/api_exception.dart';
import '../../l10n/strings.dart';

String mapErrorMessage(Object error, {String lang = 'zh'}) {
  if (error is ApiException) {
    if (error.isUnauthorized) {
      return AppStrings.t('session.expired', lang: lang);
    }
    if (error.isPayloadTooLarge || error.statusCode == 413) {
      return AppStrings.t('error.tooLarge', lang: lang);
    }
    if (error.code == 'TIMEOUT' || error.message == 'timeout') {
      return AppStrings.t('error.timeout', lang: lang);
    }
    if (error.code == 'NETWORK' || error.message == 'network') {
      return AppStrings.t('error.network', lang: lang);
    }
    if (error.message.isNotEmpty) return error.message;
  }
  if (error is DioException) {
    if (error.type == DioExceptionType.connectionTimeout ||
        error.type == DioExceptionType.sendTimeout ||
        error.type == DioExceptionType.receiveTimeout) {
      return AppStrings.t('error.timeout', lang: lang);
    }
    if (error.type == DioExceptionType.connectionError) {
      return AppStrings.t('error.network', lang: lang);
    }
    if (error.response?.statusCode == 413) {
      return AppStrings.t('error.tooLarge', lang: lang);
    }
  }
  final text = error.toString();
  if (text.isNotEmpty) return text;
  return AppStrings.t('error.generic', lang: lang);
}
