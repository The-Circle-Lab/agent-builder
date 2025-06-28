"use client";

import React, { useState } from "react";
import { AuthAPI, LoginRequest, RegisterRequest } from "./agentBuilder/scripts/authAPI";
import { validateEmail, validatePassword, validatePasswordMatch } from "@/lib/utils";

interface LoginPageProps {
  onLogin: () => void;
}

interface FormData {
  email: string;
  password: string;
  confirmPassword: string;
}

export default function LoginPage({ onLogin }: LoginPageProps) {
  const [isLogin, setIsLogin] = useState(true);
  const [formData, setFormData] = useState<FormData>({
    email: "",
    password: "",
    confirmPassword: "",
  });
  const [fieldErrors, setFieldErrors] = useState<Partial<FormData>>({});

  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const handleAuth = async (isLogin: boolean, credentials: LoginRequest | RegisterRequest) => {
    setAuthLoading(true);
    setAuthError(null);
    
    try {
      if (isLogin) {
        await AuthAPI.login(credentials as LoginRequest);
      } else {
        await AuthAPI.register(credentials as RegisterRequest);
      }
      onLogin();
    } catch (error) {
      setAuthError(error instanceof Error ? error.message : 'An unexpected error occurred');
    } finally {
      setAuthLoading(false);
    }
  };

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: value
    }));
    
    // Clear field error when user starts typing
    if (fieldErrors[name as keyof FormData]) {
      setFieldErrors(prev => ({
        ...prev,
        [name]: undefined
      }));
    }
  };

  const validateForm = (): boolean => {
    const errors: Partial<FormData> = {};

    // Email validation
    const emailValidation = validateEmail(formData.email);
    if (!emailValidation.isValid) {
      errors.email = emailValidation.error;
    }

    // Password validation
    const passwordValidation = validatePassword(formData.password);
    if (!passwordValidation.isValid) {
      errors.password = passwordValidation.error;
    }

    // Confirm password validation (only for registration)
    if (!isLogin) {
      const passwordMatchValidation = validatePasswordMatch(formData.password, formData.confirmPassword);
      if (!passwordMatchValidation.isValid) {
        errors.confirmPassword = passwordMatchValidation.error;
      }
    }

    setFieldErrors(errors);
    return Object.keys(errors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validateForm()) {
      return;
    }

    if (isLogin) {
      await handleAuth(true, {
        email: formData.email,
        password: formData.password
      });
    } else {
      await handleAuth(false, {
        email: formData.email,
        password: formData.password,
        student: true
      });
    }
  };

  const toggleMode = () => {
    setIsLogin(!isLogin);
    setFieldErrors({});
    setAuthError(null);
    setFormData({
      email: "",
      password: "",
      confirmPassword: "",
    });
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl p-8 w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            Agent Builder
          </h1>
          <p className="text-gray-600">
            {isLogin ? "Sign in to your account" : "Create your account"}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          <div>
            <label htmlFor="email" className="block text-sm font-medium text-gray-700 mb-2">
              Email Address
            </label>
            <input
              type="email"
              id="email"
              name="email"
              value={formData.email}
              onChange={handleInputChange}
              required
              className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-200 ${
                fieldErrors.email ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="Enter your email"
              aria-invalid={!!fieldErrors.email}
              aria-describedby={fieldErrors.email ? "email-error" : undefined}
            />
            {fieldErrors.email && (
              <p id="email-error" className="mt-1 text-sm text-red-600">
                {fieldErrors.email}
              </p>
            )}
          </div>

          <div>
            <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
              Password
            </label>
            <input
              type="password"
              id="password"
              name="password"
              value={formData.password}
              onChange={handleInputChange}
              required
              className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-200 ${
                fieldErrors.password ? 'border-red-300' : 'border-gray-300'
              }`}
              placeholder="Enter your password"
              aria-invalid={!!fieldErrors.password}
              aria-describedby={fieldErrors.password ? "password-error" : undefined}
            />
            {fieldErrors.password && (
              <p id="password-error" className="mt-1 text-sm text-red-600">
                {fieldErrors.password}
              </p>
            )}
          </div>

          {!isLogin && (
            <div>
              <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
                Confirm Password
              </label>
              <input
                type="password"
                id="confirmPassword"
                name="confirmPassword"
                value={formData.confirmPassword}
                onChange={handleInputChange}
                required
                className={`w-full px-4 py-3 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent transition duration-200 ${
                  fieldErrors.confirmPassword ? 'border-red-300' : 'border-gray-300'
                }`}
                placeholder="Confirm your password"
                aria-invalid={!!fieldErrors.confirmPassword}
                aria-describedby={fieldErrors.confirmPassword ? "confirm-password-error" : undefined}
              />
              {fieldErrors.confirmPassword && (
                <p id="confirm-password-error" className="mt-1 text-sm text-red-600">
                  {fieldErrors.confirmPassword}
                </p>
              )}
            </div>
          )}

          {authError && (
            <div className="bg-red-50 border border-red-200 text-red-600 px-4 py-3 rounded-lg text-sm" role="alert">
              {authError}
            </div>
          )}

          <button
            type="submit"
            disabled={authLoading}
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-blue-400 text-white font-semibold py-3 px-4 rounded-lg transition duration-200 transform hover:scale-[1.02] active:scale-[0.98] disabled:transform-none"
            aria-describedby={authError ? "form-error" : undefined}
          >
            {authLoading ? (
              <div className="flex items-center justify-center">
                <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white mr-2" aria-hidden="true"></div>
                <span>{isLogin ? "Signing in..." : "Creating account..."}</span>
              </div>
            ) : (
              isLogin ? "Sign In" : "Create Account"
            )}
          </button>
        </form>

        <div className="mt-6 text-center">
          <p className="text-sm text-gray-600">
            {isLogin ? "Don't have an account?" : "Already have an account?"}
            <button
              type="button"
              onClick={toggleMode}
              className="ml-1 text-blue-600 hover:text-blue-700 font-medium hover:underline"
            >
              {isLogin ? "Sign up" : "Sign in"}
            </button>
          </p>
        </div>
      </div>
    </div>
  );
} 
