import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the repositories and mailer before importing the service
vi.mock('../../src/repositories/user.repository.js', () => ({
  findByEmail:       vi.fn(),
  findById:          vi.fn(),
  findByIdWithHash:  vi.fn(),
  create:            vi.fn(),
  update:            vi.fn(),
  updatePassword:    vi.fn(),
  createResetToken:  vi.fn(),
  findResetToken:    vi.fn(),
  markResetTokenUsed: vi.fn(),
}));

vi.mock('../../src/utils/mailer.js', () => ({
  sendPasswordReset: vi.fn(),
}));

// Provide a JWT secret for the service
process.env.JWT_SECRET = 'test_secret_for_unit_tests_32chars!!';

import * as userRepo from '../../src/repositories/user.repository.js';
import * as mailer   from '../../src/utils/mailer.js';
import * as authService from '../../src/services/auth.service.js';

const FAKE_USER = {
  id:    1,
  name:  'Ana Test',
  email: 'ana@test.com',
  role:  'user',
  password_hash: '$2a$12$hashedpassword',
};

beforeEach(() => vi.clearAllMocks());

describe('authService.register', () => {
  it('creates a user and returns token when data is valid', async () => {
    userRepo.findByEmail.mockResolvedValue(null);
    userRepo.create.mockResolvedValue({ ...FAKE_USER, password_hash: undefined });

    const result = await authService.register({ name: 'Ana Test', email: 'ana@test.com', password: 'secret1' });

    expect(userRepo.create).toHaveBeenCalledOnce();
    expect(result).toHaveProperty('token');
    expect(result).toHaveProperty('user');
  });

  it('throws BAD_REQUEST when name is empty', async () => {
    await expect(authService.register({ name: '', email: 'a@b.com', password: 'secret1' }))
      .rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('throws BAD_REQUEST when email is missing', async () => {
    await expect(authService.register({ name: 'Ana', email: '', password: 'secret1' }))
      .rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('throws BAD_REQUEST when password is too short', async () => {
    await expect(authService.register({ name: 'Ana', email: 'a@b.com', password: '123' }))
      .rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('throws conflict when email already exists', async () => {
    userRepo.findByEmail.mockResolvedValue(FAKE_USER);
    await expect(authService.register({ name: 'Ana', email: 'ana@test.com', password: 'secret1' }))
      .rejects.toMatchObject({ code: 'EMAIL_ALREADY_EXISTS' });
  });
});

describe('authService.login', () => {
  it('throws BAD_REQUEST when fields are missing', async () => {
    await expect(authService.login({ email: '', password: '' }))
      .rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('throws UNAUTHORIZED when user is not found', async () => {
    userRepo.findByEmail.mockResolvedValue(null);
    await expect(authService.login({ email: 'no@user.com', password: 'pass' }))
      .rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('throws UNAUTHORIZED when password is wrong', async () => {
    userRepo.findByEmail.mockResolvedValue(FAKE_USER);
    // bcrypt.compare will return false because hash doesn't match 'wrongpass'
    await expect(authService.login({ email: 'ana@test.com', password: 'wrongpass' }))
      .rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

describe('authService.changePassword', () => {
  it('throws BAD_REQUEST when fields are missing', async () => {
    await expect(authService.changePassword(1, { current_password: '', new_password: '' }))
      .rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('throws BAD_REQUEST when new password is too short', async () => {
    await expect(authService.changePassword(1, { current_password: 'old', new_password: '123' }))
      .rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('throws NOT_FOUND when user does not exist', async () => {
    userRepo.findByIdWithHash.mockResolvedValue(null);
    await expect(authService.changePassword(1, { current_password: 'old', new_password: 'newpass' }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('authService.forgotPassword', () => {
  it('resolves without error even when email does not exist (anti-enumeration)', async () => {
    userRepo.findByEmail.mockResolvedValue(null);
    await expect(authService.forgotPassword('unknown@test.com')).resolves.toBeUndefined();
    expect(mailer.sendPasswordReset).not.toHaveBeenCalled();
  });

  it('creates a reset token and calls mailer when user exists', async () => {
    userRepo.findByEmail.mockResolvedValue(FAKE_USER);
    userRepo.createResetToken.mockResolvedValue();
    mailer.sendPasswordReset.mockResolvedValue();

    await authService.forgotPassword('ana@test.com');

    expect(userRepo.createResetToken).toHaveBeenCalledOnce();
    expect(mailer.sendPasswordReset).toHaveBeenCalledOnce();
    expect(mailer.sendPasswordReset).toHaveBeenCalledWith('ana@test.com', expect.any(String));
  });
});

describe('authService.resetPassword', () => {
  it('throws BAD_REQUEST when token is not found', async () => {
    userRepo.findResetToken.mockResolvedValue(null);
    await expect(authService.resetPassword('bad-token', 'newpass1'))
      .rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('throws BAD_REQUEST when token is already used', async () => {
    userRepo.findResetToken.mockResolvedValue({
      id: 1, user_id: 1, expires_at: new Date(Date.now() + 3600000), used_at: new Date(),
    });
    await expect(authService.resetPassword('used-token', 'newpass1'))
      .rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('throws BAD_REQUEST when token is expired', async () => {
    userRepo.findResetToken.mockResolvedValue({
      id: 1, user_id: 1, expires_at: new Date(Date.now() - 1000), used_at: null,
    });
    await expect(authService.resetPassword('expired-token', 'newpass1'))
      .rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('resets password and marks token as used on valid token', async () => {
    userRepo.findResetToken.mockResolvedValue({
      id: 1, user_id: 1, expires_at: new Date(Date.now() + 3600000), used_at: null,
    });
    userRepo.updatePassword.mockResolvedValue();
    userRepo.markResetTokenUsed.mockResolvedValue();

    await authService.resetPassword('valid-token', 'newpass1');

    expect(userRepo.updatePassword).toHaveBeenCalledOnce();
    expect(userRepo.markResetTokenUsed).toHaveBeenCalledWith(1);
  });
});
