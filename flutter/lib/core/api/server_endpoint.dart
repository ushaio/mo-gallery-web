class ServerEndpoint {
  const ServerEndpoint({
    required this.baseUrl,
    required this.loginUrl,
    this.loginSlug,
  });

  final String baseUrl;
  final String loginUrl;
  final String? loginSlug;
}

ServerEndpoint parseServerEndpoint(String input) {
  final raw = input.trim();
  final uri = Uri.tryParse(raw);
  if (raw.isEmpty ||
      uri == null ||
      !uri.hasScheme ||
      uri.host.isEmpty ||
      (uri.scheme != 'http' && uri.scheme != 'https')) {
    throw const FormatException('Invalid server URL');
  }
  if (uri.userInfo.isNotEmpty || uri.hasQuery || uri.hasFragment) {
    throw const FormatException(
      'Server URL cannot contain user info, query parameters, or fragments',
    );
  }

  final segments =
      uri.pathSegments.where((segment) => segment.isNotEmpty).toList();
  String? loginSlug;
  if (segments.isNotEmpty) {
    if (segments.length != 2 || segments.first != 'login') {
      throw const FormatException(
        'Use the server root or /login/<security suffix>',
      );
    }
    loginSlug = segments[1].trim();
    if (loginSlug.isEmpty || loginSlug.contains('/')) {
      throw const FormatException('Invalid administrator login suffix');
    }
  }

  final baseUri = Uri(
    scheme: uri.scheme,
    host: uri.host,
    port: uri.hasPort ? uri.port : null,
  );
  final baseUrl = baseUri.toString().replaceAll(RegExp(r'/+$'), '');
  final loginUrl = loginSlug == null
      ? baseUrl
      : '$baseUrl/login/${Uri.encodeComponent(loginSlug)}';

  return ServerEndpoint(
    baseUrl: baseUrl,
    loginUrl: loginUrl,
    loginSlug: loginSlug,
  );
}
