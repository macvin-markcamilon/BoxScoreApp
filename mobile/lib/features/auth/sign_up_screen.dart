import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:intl/intl.dart';

import '../../core/router/routes.dart';
import '../../core/theme/app_colors.dart';
import '../../data/models/user_profile.dart';
import '../../data/providers.dart';
import '../../data/repositories/auth_repository.dart';

class SignUpScreen extends ConsumerStatefulWidget {
  const SignUpScreen({super.key});

  @override
  ConsumerState<SignUpScreen> createState() => _SignUpScreenState();
}

class _SignUpScreenState extends ConsumerState<SignUpScreen> {
  final _formKey = GlobalKey<FormState>();

  final _firstNameController = TextEditingController();
  final _lastNameController = TextEditingController();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  final _heightController = TextEditingController();
  final _weightController = TextEditingController();
  final _addressController = TextEditingController();

  DateTime? _birthday;
  final Set<PlayerPosition> _selectedPositions = {PlayerPosition.pg};
  final Set<AccountRole> _selectedRoles = {AccountRole.player};

  bool _obscurePassword = true;
  bool _isLoading = false;
  String? _errorMessage;

  @override
  void dispose() {
    _firstNameController.dispose();
    _lastNameController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    _heightController.dispose();
    _weightController.dispose();
    _addressController.dispose();
    super.dispose();
  }

  void _togglePosition(PlayerPosition pos) {
    setState(() {
      if (_selectedPositions.contains(pos)) {
        if (_selectedPositions.length > 1) {
          _selectedPositions.remove(pos);
        }
      } else {
        _selectedPositions.add(pos);
      }
    });
  }

  void _toggleRole(AccountRole role) {
    setState(() {
      if (_selectedRoles.contains(role)) {
        if (_selectedRoles.length > 1) {
          _selectedRoles.remove(role);
        }
      } else {
        _selectedRoles.add(role);
      }
    });
  }

  Future<void> _pickBirthday() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _birthday ?? DateTime(now.year - 22, 1, 1),
      firstDate: DateTime(1940),
      lastDate: now,
    );
    if (picked != null) {
      setState(() => _birthday = picked);
    }
  }

  Future<void> _handleSignUp() async {
    if (!_formKey.currentState!.validate()) return;

    if (_birthday == null) {
      setState(() => _errorMessage = 'Please select your birthday.');
      return;
    }

    if (_selectedPositions.isEmpty) {
      setState(() => _errorMessage = 'Please select at least one basketball position.');
      return;
    }

    if (_selectedRoles.isEmpty) {
      setState(() => _errorMessage = 'Please select at least one role (Player, Coach, Referee, Manager).');
      return;
    }

    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      final hasImmediateSession = await ref.read(authRepositoryProvider).signUp(
            email: _emailController.text.trim(),
            password: _passwordController.text,
            firstName: _firstNameController.text.trim(),
            lastName: _lastNameController.text.trim(),
            birthday: _birthday!,
            address: _addressController.text.trim(),
            heightCm: double.tryParse(_heightController.text.trim()) ?? 0,
            weightKg: double.tryParse(_weightController.text.trim()) ?? 0,
            positions: _selectedPositions.toList(),
            roles: _selectedRoles.toList(),
          );

      if (!mounted) return;

      if (hasImmediateSession) {
        ref
          ..invalidate(profileProvider)
          ..invalidate(leaguesProvider)
          ..invalidate(followsProvider)
          ..invalidate(teamsByIdProvider)
          ..invalidate(followerCountsProvider);
        if (mounted) context.go(Routes.dashboard);
      } else {
        await showDialog<void>(
          context: context,
          builder: (context) => AlertDialog(
            title: const Text('Account Created!', style: TextStyle(fontWeight: FontWeight.w900)),
            content: const Text(
              'Your BOX SCORE profile has been registered in Supabase. Please check your email inbox to verify your address, then sign in.',
            ),
            actions: [
              FilledButton(
                onPressed: () {
                  Navigator.of(context).pop();
                  context.go(Routes.signIn);
                },
                child: const Text('Go to Sign In'),
              ),
            ],
          ),
        );
      }
    } catch (err) {
      if (mounted) {
        setState(() {
          _errorMessage = describeAuthError(err);
        });
      }
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.surface,
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 20, vertical: 24),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 480),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  // Banner logo from uploaded image
                  Center(
                    child: Padding(
                      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 6),
                      child: Image.asset(
                        'assets/branding/logo_banner.png',
                        height: 48,
                        fit: BoxFit.contain,
                        semanticLabel: 'BOX SCORE Logo',
                      ),
                    ),
                  ),
                  const SizedBox(height: 20),

                  // Top Toggle Bar matching the exact Web Design (Screenshot)
                  Container(
                    decoration: BoxDecoration(
                      color: AppColors.surfaceAlt,
                      borderRadius: BorderRadius.circular(12),
                    ),
                    padding: const EdgeInsets.all(4),
                    child: Row(
                      children: [
                        Expanded(
                          child: InkWell(
                            onTap: () => context.go(Routes.signIn),
                            borderRadius: BorderRadius.circular(10),
                            child: Container(
                              padding: const EdgeInsets.symmetric(vertical: 10),
                              child: const Text(
                                'SIGN IN TO ACCOUNT',
                                textAlign: TextAlign.center,
                                style: TextStyle(
                                  color: AppColors.brandNavy,
                                  fontWeight: FontWeight.w900,
                                  fontSize: 12,
                                  letterSpacing: 0.6,
                                ),
                              ),
                            ),
                          ),
                        ),
                        Expanded(
                          child: Container(
                            padding: const EdgeInsets.symmetric(vertical: 10),
                            decoration: BoxDecoration(
                              color: AppColors.brandRed,
                              borderRadius: BorderRadius.circular(10),
                            ),
                            child: const Text(
                              'CREATE NEW ACCOUNT',
                              textAlign: TextAlign.center,
                              style: TextStyle(
                                color: Colors.white,
                                fontWeight: FontWeight.w900,
                                fontSize: 12,
                                letterSpacing: 0.6,
                              ),
                            ),
                          ),
                        ),
                      ],
                    ),
                  ),
                  const SizedBox(height: 24),

                  if (_errorMessage != null) ...[
                    Container(
                      padding: const EdgeInsets.all(12),
                      decoration: BoxDecoration(
                        color: Colors.red.shade50,
                        border: Border.all(color: Colors.red.shade200),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: Text(
                        _errorMessage!,
                        style: TextStyle(color: Colors.red.shade800, fontWeight: FontWeight.w600, fontSize: 13),
                      ),
                    ),
                    const SizedBox(height: 16),
                  ],

                  Form(
                    key: _formKey,
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        // First Name & Last Name
                        Row(
                          children: [
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Text('FIRST NAME *', style: _labelStyle),
                                  const SizedBox(height: 6),
                                  TextFormField(
                                    controller: _firstNameController,
                                    decoration: const InputDecoration(
                                      hintText: 'e.g. Kiefer',
                                      prefixIcon: Icon(Icons.person_outline),
                                    ),
                                    validator: (v) => (v == null || v.trim().isEmpty) ? 'Required' : null,
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(width: 12),
                            Expanded(
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Text('LAST NAME *', style: _labelStyle),
                                  const SizedBox(height: 6),
                                  TextFormField(
                                    controller: _lastNameController,
                                    decoration: const InputDecoration(
                                      hintText: 'e.g. Ravena',
                                      prefixIcon: Icon(Icons.person_outline),
                                    ),
                                    validator: (v) => (v == null || v.trim().isEmpty) ? 'Required' : null,
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 16),

                        // Email Address
                        const Text('EMAIL ADDRESS *', style: _labelStyle),
                        const SizedBox(height: 6),
                        TextFormField(
                          controller: _emailController,
                          keyboardType: TextInputType.emailAddress,
                          autocorrect: false,
                          decoration: const InputDecoration(
                            hintText: 'athlete@boxscore.ph',
                            prefixIcon: Icon(Icons.email_outlined),
                          ),
                          validator: (v) {
                            if (v == null || v.trim().isEmpty) return 'Please enter your email';
                            if (!v.contains('@')) return 'Enter a valid email address';
                            return null;
                          },
                        ),
                        const SizedBox(height: 16),

                        // Password
                        Row(
                          mainAxisAlignment: MainAxisAlignment.spaceBetween,
                          children: [
                            const Text('PASSWORD *', style: _labelStyle),
                            InkWell(
                              onTap: () => setState(() => _obscurePassword = !_obscurePassword),
                              child: Text(
                                _obscurePassword ? 'Show' : 'Hide',
                                style: const TextStyle(fontWeight: FontWeight.w800, fontSize: 12, color: AppColors.brandNavy),
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 6),
                        TextFormField(
                          controller: _passwordController,
                          obscureText: _obscurePassword,
                          decoration: const InputDecoration(
                            hintText: 'At least 6 characters',
                            prefixIcon: Icon(Icons.lock_outline),
                            helperText: 'Minimum 6 characters required by Supabase Auth.',
                          ),
                          validator: (v) {
                            if (v == null || v.length < 6) return 'Password must be at least 6 characters';
                            return null;
                          },
                        ),
                        const SizedBox(height: 16),

                        // Birthday, Height, Weight
                        Row(
                          children: [
                            Expanded(
                              flex: 4,
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Text('BIRTHDAY *', style: _labelStyle),
                                  const SizedBox(height: 6),
                                  InkWell(
                                    onTap: _pickBirthday,
                                    borderRadius: BorderRadius.circular(12),
                                    child: InputDecorator(
                                      decoration: const InputDecoration(
                                        prefixIcon: Icon(Icons.calendar_today_outlined),
                                        contentPadding: EdgeInsets.symmetric(horizontal: 10, vertical: 14),
                                      ),
                                      child: Text(
                                        _birthday != null ? DateFormat('MM/dd/yyyy').format(_birthday!) : 'mm/dd/yyyy',
                                        maxLines: 1,
                                        overflow: TextOverflow.ellipsis,
                                        style: TextStyle(
                                          color: _birthday != null ? AppColors.textStrong : AppColors.textMuted,
                                        ),
                                      ),
                                    ),
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              flex: 3,
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Text('HEIGHT (CM) *', style: _labelStyle),
                                  const SizedBox(height: 6),
                                  TextFormField(
                                    controller: _heightController,
                                    keyboardType: TextInputType.number,
                                    decoration: const InputDecoration(
                                      hintText: 'e.g. 185',
                                      prefixIcon: Icon(Icons.straighten, size: 18),
                                    ),
                                    validator: (v) => (v == null || v.trim().isEmpty) ? 'Required' : null,
                                  ),
                                ],
                              ),
                            ),
                            const SizedBox(width: 8),
                            Expanded(
                              flex: 3,
                              child: Column(
                                crossAxisAlignment: CrossAxisAlignment.start,
                                children: [
                                  const Text('WEIGHT (KG) *', style: _labelStyle),
                                  const SizedBox(height: 6),
                                  TextFormField(
                                    controller: _weightController,
                                    keyboardType: TextInputType.number,
                                    decoration: const InputDecoration(
                                      hintText: 'e.g. 82',
                                      prefixIcon: Icon(Icons.balance, size: 18),
                                    ),
                                    validator: (v) => (v == null || v.trim().isEmpty) ? 'Required' : null,
                                  ),
                                ],
                              ),
                            ),
                          ],
                        ),
                        const SizedBox(height: 16),

                        // Home / Court Address
                        const Text('HOME / COURT ADDRESS *', style: _labelStyle),
                        const SizedBox(height: 6),
                        TextFormField(
                          controller: _addressController,
                          maxLines: 2,
                          decoration: const InputDecoration(
                            hintText: 'Street, Barangay, City / Province',
                            prefixIcon: Icon(Icons.place_outlined),
                            helperText: 'Used to recommend nearby basketball courts and local tournaments in your area.',
                            helperMaxLines: 2,
                          ),
                          validator: (v) => (v == null || v.trim().isEmpty) ? 'Address is required' : null,
                        ),
                        const SizedBox(height: 20),

                        // Basketball Position
                        const Text(
                          'BASKETBALL POSITION (MULTI-SELECT: PG, SG, SF, PF, C) *',
                          style: _labelStyle,
                        ),
                        const SizedBox(height: 8),
                        Row(
                          children: [
                            for (final pos in PlayerPosition.values)
                              Expanded(
                                child: Padding(
                                  padding: const EdgeInsets.symmetric(horizontal: 2.5),
                                  child: InkWell(
                                    onTap: () => _togglePosition(pos),
                                    borderRadius: BorderRadius.circular(10),
                                    child: Container(
                                      padding: const EdgeInsets.symmetric(vertical: 12),
                                      decoration: BoxDecoration(
                                        color: _selectedPositions.contains(pos) ? AppColors.brandRed : Colors.white,
                                        borderRadius: BorderRadius.circular(10),
                                        border: Border.all(
                                          color: _selectedPositions.contains(pos) ? AppColors.brandRed : AppColors.border,
                                        ),
                                      ),
                                      child: Column(
                                        children: [
                                          Text(
                                            pos.code,
                                            style: TextStyle(
                                              fontWeight: FontWeight.w900,
                                              fontSize: 16,
                                              color: _selectedPositions.contains(pos) ? Colors.white : AppColors.textStrong,
                                            ),
                                          ),
                                          const SizedBox(height: 2),
                                          Text(
                                            pos.label,
                                            maxLines: 1,
                                            overflow: TextOverflow.ellipsis,
                                            style: TextStyle(
                                              fontSize: 8.5,
                                              fontWeight: FontWeight.w700,
                                              color: _selectedPositions.contains(pos) ? Colors.white70 : AppColors.textMuted,
                                            ),
                                          ),
                                        ],
                                      ),
                                    ),
                                  ),
                                ),
                              ),
                          ],
                        ),
                        const SizedBox(height: 20),

                        // Role Selector Grid
                        const Text(
                          'ARE YOU A PLAYER, COACH, REFEREE, OR MANAGER? (MULTI-SELECT) *',
                          style: _labelStyle,
                        ),
                        const SizedBox(height: 8),
                        GridView.count(
                          crossAxisCount: 2,
                          crossAxisSpacing: 10,
                          mainAxisSpacing: 10,
                          childAspectRatio: 1.7,
                          shrinkWrap: true,
                          physics: const NeverScrollableScrollPhysics(),
                          children: [
                            for (final role in AccountRole.values)
                              _RoleSelectionTile(
                                role: role,
                                isSelected: _selectedRoles.contains(role),
                                onToggle: () => _toggleRole(role),
                              ),
                          ],
                        ),
                        const SizedBox(height: 28),

                        // Submit Button
                        FilledButton(
                          onPressed: _isLoading ? null : _handleSignUp,
                          child: _isLoading
                              ? const SizedBox(
                                  height: 22,
                                  width: 22,
                                  child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                                )
                              : const Text('CREATE BOX SCORE ACCOUNT'),
                        ),
                        const SizedBox(height: 20),

                        Center(
                          child: Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              const Text('Already have an account? ', style: TextStyle(color: AppColors.textMuted)),
                              InkWell(
                                onTap: () => context.go(Routes.signIn),
                                child: const Text(
                                  'Sign In',
                                  style: TextStyle(fontWeight: FontWeight.w900, color: AppColors.brandRed),
                                ),
                              ),
                            ],
                          ),
                        ),
                      ],
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

const _labelStyle = TextStyle(
  fontWeight: FontWeight.w900,
  fontSize: 11.5,
  letterSpacing: 0.6,
  color: AppColors.brandNavy,
);

class _RoleSelectionTile extends StatelessWidget {
  const _RoleSelectionTile({
    required this.role,
    required this.isSelected,
    required this.onToggle,
  });

  final AccountRole role;
  final bool isSelected;
  final VoidCallback onToggle;

  @override
  Widget build(BuildContext context) {
    final icon = switch (role) {
      AccountRole.player => Icons.person_outline,
      AccountRole.coach => Icons.sports_outlined,
      AccountRole.referee => Icons.sports_score_outlined,
      AccountRole.manager => Icons.manage_accounts_outlined,
    };

    return InkWell(
      onTap: onToggle,
      borderRadius: BorderRadius.circular(12),
      child: Container(
        padding: const EdgeInsets.all(10),
        decoration: BoxDecoration(
          color: Colors.white,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(
            color: isSelected ? AppColors.brandNavy : AppColors.border,
            width: isSelected ? 2 : 1,
          ),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Row(
              children: [
                Icon(
                  isSelected ? Icons.check_box : Icons.check_box_outline_blank,
                  size: 20,
                  color: isSelected ? AppColors.brandRed : AppColors.textMuted,
                ),
                const SizedBox(width: 6),
                Icon(icon, size: 16, color: AppColors.brandNavy),
                const SizedBox(width: 4),
                Expanded(
                  child: Text(
                    role.value.toUpperCase(),
                    maxLines: 1,
                    overflow: TextOverflow.ellipsis,
                    style: const TextStyle(fontWeight: FontWeight.w900, fontSize: 13, letterSpacing: 0.5),
                  ),
                ),
              ],
            ),
            const SizedBox(height: 4),
            Text(
              role.description,
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
              style: const TextStyle(fontSize: 10, color: AppColors.textMuted, height: 1.2),
            ),
          ],
        ),
      ),
    );
  }
}
