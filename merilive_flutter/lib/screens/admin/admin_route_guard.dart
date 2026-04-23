import 'package:flutter/material.dart';
import '../../services/api_service.dart';

class AdminRouteGuard extends StatelessWidget {
  final String? hubKey;
  final Widget child;

  const AdminRouteGuard({
    super.key,
    this.hubKey,
    required this.child,
  });

  @override
  Widget build(BuildContext context) {
    final api = ApiService();

    // Owners have bypass
    if (api.isOwner) return child;

    // If no hub key provided, we assume it's a general admin area (like Dashboard overview)
    // Owners only for Dashboard Overview in the web app parity
    if (hubKey == null) {
      return _buildNoAccess(context, "Dashboard Overview is restricted to Owners.");
    }

    return FutureBuilder<bool>(
      future: api.hasHubAccess(hubKey!),
      builder: (context, snapshot) {
        if (snapshot.connectionState == ConnectionState.waiting) {
          return const Center(child: CircularProgressIndicator(color: Color(0xFF6366F1)));
        }

        if (snapshot.data == true) {
          return child;
        }

        return _buildNoAccess(context, "You do not have permission to access the $hubKey.");
      },
    );
  }

  Widget _buildNoAccess(BuildContext context, String message) {
    return Center(
      child: Column(
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          const Icon(Icons.lock_person_outlined, color: Colors.redAccent, size: 64),
          const SizedBox(height: 24),
          const Text(
            "ACCESS DENIED",
            style: TextStyle(color: Colors.white, fontSize: 24, fontWeight: FontWeight.bold),
          ),
          const SizedBox(height: 12),
          Text(
            message,
            style: const TextStyle(color: Colors.white38, fontSize: 14),
            textAlign: TextAlign.center,
          ),
          const SizedBox(height: 32),
          ElevatedButton(
            onPressed: () {
              // Usually we'd redirect to a safe page or show a toast
            },
            style: ElevatedButton.styleFrom(backgroundColor: Colors.white10),
            child: const Text("Request Access from Owner"),
          ),
        ],
      ),
    );
  }
}
