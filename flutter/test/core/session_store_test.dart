import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:mo_gallery_mobile/app/providers.dart';
import 'package:mo_gallery_mobile/core/auth/session.dart';
import 'package:mo_gallery_mobile/core/auth/session_store.dart';

Session session({
  required String environmentId,
  required String token,
}) {
  return Session(
    environmentId: environmentId,
    environmentName: environmentId,
    serverUrl: 'https://$environmentId.example.com',
    jwtSecret: 'secret-$environmentId',
    token: token,
    username: 'admin-$environmentId',
    isAdmin: true,
  );
}

void main() {
  test('sessions and tokens stay isolated by environment', () async {
    final store = MemorySessionStore();
    await store.write(
      session(environmentId: 'production', token: 'production-token'),
    );
    await store.write(
      session(environmentId: 'staging', token: 'staging-token'),
    );

    expect((await store.read())?.environmentId, 'staging');
    await store.clearActiveToken();

    expect((await store.readById('staging'))?.token, isEmpty);
    expect(
      (await store.readById('production'))?.token,
      'production-token',
    );

    await store.setActive('production');
    expect((await store.read())?.token, 'production-token');
  });

  test('active profile remains readable when it needs sign-in', () async {
    final store = MemorySessionStore();
    await store.write(
      session(environmentId: 'staging', token: ''),
    );

    expect(await store.read(), isNull);
    expect((await store.readActive())?.environmentId, 'staging');
    expect((await store.readActive())?.username, 'admin-staging');
  });

  test('removing the active environment selects the next saved profile',
      () async {
    final store = MemorySessionStore();
    await store.write(
      session(environmentId: 'production', token: 'production-token'),
    );
    await store.write(
      session(environmentId: 'staging', token: 'staging-token'),
    );

    await store.remove('staging');

    expect(await store.readById('staging'), isNull);
    expect(await store.readActiveId(), 'production');
    expect((await store.read())?.token, 'production-token');
  });

  test('switches environments while the saved environment list is watched',
      () async {
    final store = MemorySessionStore();
    await store.write(session(environmentId: 'production', token: ''));
    await store.write(session(environmentId: 'staging', token: ''));
    await store.setActive('production');

    final container = ProviderContainer(
      overrides: [sessionStoreProvider.overrideWithValue(store)],
    );
    addTearDown(container.dispose);

    final authReady = Completer<void>();
    final authSubscription = container.listen(
      authControllerProvider,
      (previous, next) {
        if (!next.isLoading && !authReady.isCompleted) {
          authReady.complete();
        }
      },
      fireImmediately: true,
    );
    addTearDown(authSubscription.close);
    final environmentsSubscription = container.listen(
      environmentsProvider,
      (previous, next) {},
      fireImmediately: true,
    );
    addTearDown(environmentsSubscription.close);

    await authReady.future;
    expect(
      (await container.read(environmentsProvider.future))
          .map((environment) => environment.environmentId),
      ['production', 'staging'],
    );

    await container
        .read(authControllerProvider.notifier)
        .switchEnvironment('staging');

    expect(await store.readActiveId(), 'staging');
    expect(container.read(authControllerProvider).valueOrNull, isNull);
  });
}
