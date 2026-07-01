import 'package:hydrated_bloc/hydrated_bloc.dart';
import 'package:path_provider/path_provider.dart';

/// Initializes HydratedBloc storage.
/// Must be awaited BEFORE `runApp(...)`.
class HydratedStorageBootstrap {
  const HydratedStorageBootstrap._();

  static Future<void> init() async {
    final dir = await getApplicationDocumentsDirectory();
    HydratedBloc.storage = await HydratedStorage.build(
      storageDirectory: HydratedStorageDirectory(dir.path),
    );
  }
}
