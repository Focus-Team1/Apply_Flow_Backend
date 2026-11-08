import { Request, Response } from "express";
// @ts-ignore bcrypt has no declaration file in this project
import bcrypt from 'bcrypt';
import { prisma } from '../../config/database.config.js';
import { statusCodes, Message, errorCodes } from '../../constants/response.constants.js';
import customErrors from '../../utils/exception.utils.js';
import { updateProfileSchema } from './user.schema.js';

export const getMyProfile = async (req: Request) => {
  const userId = req.user?.userId;

  if (!userId) {
    throw new customErrors(
      statusCodes.unauthorized,
      Message.userNotFound,
      errorCodes.notFound
    );
  }

  const user = await prisma.user.findUnique({
    where: {
      id: userId,
    },
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      address: true,
      city: true,
      country: true,
      linkedinUrl: true,
      githubUrl: true,
      bio: true,
      isEmailVerified: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!user) {
    throw new customErrors(
      statusCodes.notFound,
      Message.userNotFound,
      errorCodes.userNotFound
    );
  }

  return {
    statusCode: statusCodes.ok,
    message: Message.profileFetched,
    data: user,
  };
};

export const updateMyProfile = async (req: Request) => {
  const userId = req.user?.userId;

  if (!userId) {
    throw new customErrors(
      statusCodes.unauthorized,
      Message.userNotFound,
      errorCodes.unauthorized
    );
  }

  const data = updateProfileSchema.parse(req.body);

  const existingUser = await prisma.user.findUnique({
    where: {
      id: userId,
    },
  });

  if (!existingUser) {
    throw new customErrors(
      statusCodes.notFound,
      Message.userNotFound,
      errorCodes.userNotFound
    );
  }

  const updatedUser = await prisma.user.update({
    where: {
      id: userId,
    },
    data,
    select: {
      id: true,
      name: true,
      email: true,
      phone: true,
      address: true,
      city: true,
      country: true,
      linkedinUrl: true,
      githubUrl: true,
      bio: true,
      isEmailVerified: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  return {
    statusCode: statusCodes.ok,
    message: Message.profileUpdated,
    data: updatedUser,
  };
};

export const deleteMyAccount = async (req: Request) => {
  console.log('[deleteMyAccount] Called for user:', req.user?.userId);
  
  const userId = req.user?.userId;

  if (!userId) {
    console.log('[deleteMyAccount] No userId found');
    throw new customErrors(
      statusCodes.unauthorized,
      Message.userNotFound,
      errorCodes.unauthorized
    );
  }

  const existingUser = await prisma.user.findUnique({
    where: {
      id: userId,
    },
  });

  if (!existingUser) {
    console.log('[deleteMyAccount] User not found in database');
    throw new customErrors(
      statusCodes.notFound,
      Message.userNotFound,
      errorCodes.userNotFound
    );
  }

  try {
    // Delete all related data in correct order
    // 1. Delete applications - this will cascade delete ApplicationStatusHistory
    console.log('[deleteMyAccount] Deleting applications (this will cascade delete status history)');
    await prisma.application.deleteMany({
      where: {
        userId: userId,
      },
    });

    console.log('[deleteMyAccount] Deleting resumes');
    await prisma.resume.deleteMany({
      where: {
        userId: userId,
      },
    });

    console.log('[deleteMyAccount] Deleting settings');
    try {
      await prisma.setting.deleteMany({
        where: {
          userId: userId,
        },
      });
    } catch (settingError) {
      console.log('[deleteMyAccount] Settings table might not exist, continuing anyway:', (settingError as any)?.code);
      // Continue with deletion even if settings table doesn't exist
    }

    console.log('[deleteMyAccount] Deleting user');
    await prisma.user.delete({
      where: {
        id: userId,
      },
    });
    
    console.log('[deleteMyAccount] User deleted successfully');
  } catch (error) {
    console.error('[deleteMyAccount] Error during deletion:', error);
    throw error;
  }

  return {
    statusCode: statusCodes.ok,
    message: Message.accountDeleted,
    data: {}
  };
};

export const changePassword = async (req: Request) => {
  const userId = req.user?.userId;

  if (!userId) {
    throw new customErrors(
      statusCodes.unauthorized,
      Message.userNotFound,
      errorCodes.unauthorized
    );
  }

  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    throw new customErrors(
      statusCodes.badRequest,
      "Current password and new password are required",
      errorCodes.invalidInput
    );
  }

  // Validate new password length
  if (newPassword.length < 8) {
    throw new customErrors(
      statusCodes.badRequest,
      "New password must be at least 8 characters long",
      errorCodes.invalidInput
    );
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, password: true },
  });

  if (!user) {
    throw new customErrors(
      statusCodes.notFound,
      Message.userNotFound,
      errorCodes.userNotFound
    );
  }

  // Verify current password
  const isPasswordValid = await bcrypt.compare(currentPassword, user.password || '');
  if (!isPasswordValid) {
    throw new customErrors(
      statusCodes.badRequest,
      "Current password is incorrect",
      errorCodes.invalidInput
    );
  }

  // Hash new password
  const hashedPassword = await bcrypt.hash(newPassword, 10);

  // Update password
  await prisma.user.update({
    where: { id: userId },
    data: { password: hashedPassword },
  });

  return {
    statusCode: statusCodes.ok,
    message: "Password changed successfully",
    data: {}
  };
};