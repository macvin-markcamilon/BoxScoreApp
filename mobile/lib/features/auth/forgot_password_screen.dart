import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../../core/theme/app_colors.dart';
import '../../data/providers.dart';
import '../../data/repositories/auth_repository.dart';

class ForgotPasswordScreen extends ConsumerStatefulWidget {
  const ForgotPasswordScreen({super.key});

  @override
  ConsumerState<ForgotPasswordScreen> createState() => _ForgotPasswordScreenState();
}

class _ForgotPasswordScreenState extends ConsumerState<ForgotPasswordScreen> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  bool _isLoading = false;
  String? _errorMessage;
  bool _isSuccess = false;

  @override
  void dispose() {
    _emailController.dispose();
    super.dispose();
  }

  Future<void> _handleReset() async {
    if (!_formKey.currentState!.validate()) return;
    setState(() {
      _isLoading = true;
      _errorMessage = null;
    });

    try {
      await ref.read(authRepositoryProvider).sendPasswordReset(_emailController.text.trim());
      setState(() => _isSuccess = true);
    } catch (err) {
      setState(() => _errorMessage = describeAuthError(err));
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('RESET PASSWORD'),
      ),
      body: SafeArea(
        child: Center(
          child: SingleChildScrollView(
            padding: const EdgeInsets.symmetric(horizontal: 24, vertical: 20),
            child: ConstrainedBox(
              constraints: const BoxConstraints(maxWidth: 420),
              child: _isSuccess
                  ? Column(
                      children: [
                        const CircleAvatar(
                          radius: 36,
                          backgroundColor: Colors.green,
                          child: Icon(Icons.check, color: Colors.white, size: 36),
                        ),
                        const SizedBox(height: 20),
                        const Text(
                          'Check Your Email',
                          style: TextStyle(fontWeight: FontWeight.w900, fontSize: 20),
                        ),
                        const SizedBox(height: 8),
                        Text(
                          'We sent a password reset link to ${_emailController.text.trim()}. Follow the instructions in the email to set a new password.',
                          textAlign: TextAlign.center,
                          style: const TextStyle(color: AppColors.textMuted, height: 1.5),
                        ),
                        const SizedBox(height: 24),
                        FilledButton(
                          onPressed: () => Navigator.of(context).pop(),
                          child: const Text('BACK TO SIGN IN'),
                        ),
                      ],
                    )
                  : Form(
                      key: _formKey,
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          const Text(
                            'Forgot your password?',
                            style: TextStyle(fontWeight: FontWeight.w900, fontSize: 22, color: AppColors.brandNavy),
                          ),
                          const SizedBox(height: 8),
                          const Text(
                            'Enter your registered account email and we will send you a link to reset your credentials.',
                            style: TextStyle(color: AppColors.textMuted, height: 1.4),
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

                          const Text(
                            'EMAIL ADDRESS *',
                            style: TextStyle(fontWeight: FontWeight.w900, fontSize: 12, letterSpacing: 0.6, color: AppColors.brandNavy),
                          ),
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
                          const SizedBox(height: 24),

                          FilledButton(
                            onPressed: _isLoading ? null : _handleReset,
                            child: _isLoading
                                ? const SizedBox(
                                    height: 20,
                                    width: 20,
                                    child: CircularProgressIndicator(color: Colors.white, strokeWidth: 2),
                                  )
                                : const Text('SEND RESET LINK'),
                          ),
                        ],
                      ),
                    ),
            ),
          ),
        ),
      ),
    );
  }
}
