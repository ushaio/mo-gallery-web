class Session {
  const Session({
    required this.serverUrl,
    required this.jwtSecret,
    required this.token,
    required this.username,
    required this.isAdmin,
  });

  final String serverUrl;
  final String jwtSecret;
  final String token;
  final String username;
  final bool isAdmin;

  Session copyWith({
    String? serverUrl,
    String? jwtSecret,
    String? token,
    String? username,
    bool? isAdmin,
  }) {
    return Session(
      serverUrl: serverUrl ?? this.serverUrl,
      jwtSecret: jwtSecret ?? this.jwtSecret,
      token: token ?? this.token,
      username: username ?? this.username,
      isAdmin: isAdmin ?? this.isAdmin,
    );
  }
}
