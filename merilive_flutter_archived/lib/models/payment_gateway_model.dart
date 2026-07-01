class PaymentGateway {
  final String id;
  final String name;
  final String? logoUrl;
  final List<String> countryCodes;
  final bool isIntegrated;
  final bool isActive;
  final int displayOrder;
  final String? gatewayType;

  PaymentGateway({
    required this.id,
    required this.name,
    this.logoUrl,
    required this.countryCodes,
    this.isIntegrated = false,
    this.isActive = true,
    this.displayOrder = 0,
    this.gatewayType,
  });

  factory PaymentGateway.fromJson(Map<String, dynamic> json) {
    // Handle the nested structure if it's coming from a join
    final gatewayData = json['payment_gateways'] ?? json;
    
    return PaymentGateway(
      id: gatewayData['id'].toString(),
      name: gatewayData['name'] ?? 'Unknown',
      logoUrl: gatewayData['logo_url'],
      countryCodes: gatewayData['country_codes'] != null 
          ? List<String>.from(gatewayData['country_codes']) 
          : [],
      isIntegrated: gatewayData['is_integrated'] ?? false,
      isActive: gatewayData['is_active'] ?? true,
      displayOrder: gatewayData['display_order'] ?? 0,
      gatewayType: gatewayData['gateway_type'],
    );
  }
}


