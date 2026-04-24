/// MeriLive App Version Model — `public.app_version_settings` table.
///
/// Used to gate the Flutter app on cold start: compare device version to
/// `minimumVersion`; if lower and `forceUpdate == true`, block the app.
class AppVersionModel {
  final String id;
  final String platform; // android | ios
  final String currentVersion;
  final String minimumVersion;
  final bool forceUpdate;
  final bool isMaintenance;
  final String? maintenanceMessage;
  final DateTime? maintenanceEndTime;
  final String? updateUrl;
  final String? changelog;

  AppVersionModel({
    required this.id,
    required this.platform,
    required this.currentVersion,
    required this.minimumVersion,
    this.forceUpdate = false,
    this.isMaintenance = false,
    this.maintenanceMessage,
    this.maintenanceEndTime,
    this.updateUrl,
    this.changelog,
  });

  factory AppVersionModel.fromJson(Map<String, dynamic> json) {
    return AppVersionModel(
      id: json['id'] ?? '',
      platform: json['platform'] ?? 'android',
      currentVersion: json['current_version'] ?? '0.0.0',
      minimumVersion: json['minimum_version'] ?? '0.0.0',
      forceUpdate: json['force_update'] ?? false,
      isMaintenance: json['is_maintenance'] ?? false,
      maintenanceMessage: json['maintenance_message'],
      maintenanceEndTime: json['maintenance_end_time'] != null
          ? DateTime.tryParse(json['maintenance_end_time'])
          : null,
      updateUrl: json['update_url'],
      changelog: json['changelog'],
    );
  }
}
