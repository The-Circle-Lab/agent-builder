import { apiClient } from '@/lib/apiClient';
import { ROUTES } from '@/lib/constants';
import { validateEmail, validatePassword } from '@/lib/utils';

export interface LoginRequest {
  email: string;
  password: string;
}

export interface RegisterRequest {
  email: string;
  password: string;
  key?: string;  // Optional since it's only required for instructors
  is_instructor?: boolean;
}

export interface User {
  id: number;
  email: string;
  student: boolean;
  first_name?: string;
  last_name?: string;
  about_me?: string;
  birthday?: string; // ISO date string
}

export interface UpdateProfileRequest {
  first_name?: string;
  last_name?: string;
  about_me?: string;
  birthday?: string; // ISO date string
}

export class AuthAPI {
  static async login(credentials: LoginRequest): Promise<void> {
    // Validate input
    const emailValidation = validateEmail(credentials.email);
    if (!emailValidation.isValid) {
      throw new Error(emailValidation.error);
    }

    const passwordValidation = validatePassword(credentials.password);
    if (!passwordValidation.isValid) {
      throw new Error(passwordValidation.error);
    }

    const response = await apiClient.post(ROUTES.AUTH.LOGIN, credentials);
    
    if (response.error) {
      throw new Error(response.error);
    }
  }

  static async register(userData: RegisterRequest): Promise<void> {
    // Validate input
    const emailValidation = validateEmail(userData.email);
    if (!emailValidation.isValid) {
      throw new Error(emailValidation.error);
    }

    const passwordValidation = validatePassword(userData.password);
    if (!passwordValidation.isValid) {
      throw new Error(passwordValidation.error);
    }

    const response = await apiClient.post(ROUTES.AUTH.REGISTER, {
      ...userData,
      is_instructor: userData.is_instructor ?? false
    });
    
    if (response.error) {
      throw new Error(response.error);
    }
  }

  static async logout(): Promise<void> {
    const response = await apiClient.post(ROUTES.AUTH.LOGOUT);
    
    if (response.error) {
      throw new Error(response.error);
    }
  }

  static async getCurrentUser(): Promise<User> {
    const response = await apiClient.get<User>(ROUTES.AUTH.ME);
    
    if (response.error) {
      if (response.status === 401) {
        throw new Error('Not authenticated');
      }
      throw new Error(response.error);
    }

    if (!response.data) {
      throw new Error('No user data received');
    }

    return response.data;
  }

  static async checkAuth(): Promise<boolean> {
    try {
      await this.getCurrentUser();
      return true;
    } catch {
      return false;
    }
  }

  static async updateProfile(profileData: UpdateProfileRequest): Promise<User> {
    const response = await apiClient.patch<User>(ROUTES.AUTH.PROFILE, profileData);
    
    if (response.error) {
      throw new Error(response.error);
    }

    if (!response.data) {
      throw new Error('No profile data received');
    }

    return response.data;
  }
} 
