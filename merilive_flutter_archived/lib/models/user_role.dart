enum UserRole {
  user,
  host,
  agency,
  trader,
}

extension UserRoleExtension on UserRole {
  String get label {
    switch (this) {
      case UserRole.user:
        return 'User';
      case UserRole.host:
        return 'Host';
      case UserRole.agency:
        return 'Agency Owner';
      case UserRole.trader:
        return 'Trader Help';
    }
  }

  bool get isHost => this == UserRole.host;
  bool get isAgency => this == UserRole.agency;
  bool get isTrader => this == UserRole.trader;
}
