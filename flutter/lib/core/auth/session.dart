class Session {
  const Session({
    this.environmentId = 'legacy',
    this.environmentName = '',
    required this.serverUrl,
    this.loginUrl,
    required this.jwtSecret,
    required this.token,
    required this.username,
    required this.isAdmin,
  });

  final String environmentId;
  final String environmentName;
  final String serverUrl;
  final String? loginUrl;
  final String jwtSecret;
  final String token;
  final String username;
  final bool isAdmin;

  String get displayName {
    final name = environmentName.trim();
    if (name.isNotEmpty) return name;
    return Uri.tryParse(serverUrl)?.host ?? serverUrl;
  }

  bool get isAuthenticated => token.isNotEmpty;

  Session copyWith({
    String? environmentId,
    String? environmentName,
    String? serverUrl,
    String? loginUrl,
    String? jwtSecret,
    String? token,
    String? username,
    bool? isAdmin,
  }) {
    return Session(
      environmentId: environmentId ?? this.environmentId,
      environmentName: environmentName ?? this.environmentName,
      serverUrl: serverUrl ?? this.serverUrl,
      loginUrl: loginUrl ?? this.loginUrl,
      jwtSecret: jwtSecret ?? this.jwtSecret,
      token: token ?? this.token,
      username: username ?? this.username,
      isAdmin: isAdmin ?? this.isAdmin,
    );
  }

  Map<String, dynamic> toJson() => {
        'environmentId': environmentId,
        'environmentName': environmentName,
        'serverUrl': serverUrl,
        'loginUrl': loginUrl,
        'jwtSecret': jwtSecret,
        'token': token,
        'username': username,
        'isAdmin': isAdmin,
      };

  factory Session.fromJson(Map<String, dynamic> json) {
    return Session(
      environmentId: (json['environmentId'] as String?) ?? 'legacy',
      environmentName: (json['environmentName'] as String?) ?? '',
      serverUrl: (json['serverUrl'] as String?) ?? '',
      loginUrl: json['loginUrl'] as String?,
      jwtSecret: (json['jwtSecret'] as String?) ?? '',
      token: (json['token'] as String?) ?? '',
      username: (json['username'] as String?) ?? '',
      isAdmin: json['isAdmin'] == true,
    );
  }
}
