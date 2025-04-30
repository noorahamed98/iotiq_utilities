import { findByMobileNumber, updateUser } from "../models/userModel.js";
import { v4 as uuidv4 } from "uuid"; // You'll need to install this package

// Get all spaces for a user
export function getUserSpaces(mobileNumber) {
  const user = findByMobileNumber(mobileNumber);
  if (!user) {
    throw new Error("User not found");
  }
  return user.spaces || [];
}

// Get a specific space by name for a user
export function getUserSpaceByName(mobileNumber, spaceName) {
  const user = findByMobileNumber(mobileNumber);
  if (!user) {
    throw new Error("User not found");
  }

  const space = user.spaces.find((space) => space.space_name === spaceName);
  if (!space) {
    throw new Error("Space not found");
  }

  return space;
}

// Get a specific space by ID for a user
export function getUserSpaceById(mobileNumber, spaceId) {
  const user = findByMobileNumber(mobileNumber);
  if (!user) {
    throw new Error("User not found");
  }

  const space = user.spaces.find((space) => space.id === spaceId);
  if (!space) {
    throw new Error("Space not found");
  }

  return space;
}

// Create a new space for a user
export function createSpace(mobileNumber, spaceData) {
  const user = findByMobileNumber(mobileNumber);
  if (!user) {
    throw new Error("User not found");
  }

  // Check if space with the same name already exists for this user
  const existingSpace = user.spaces.find(
    (space) => space.space_name === spaceData.space_name
  );

  if (existingSpace) {
    throw new Error(
      `Space with name '${spaceData.space_name}' already exists for this user`
    );
  }

  // Create a new space with a unique ID
  const newSpace = {
    id: uuidv4(), // Generate a unique ID
    space_name: spaceData.space_name,
    address: spaceData.address || "",
    devices: spaceData.devices || [],
    created_at: new Date().toISOString(),
  };

  // Add space to user's spaces
  user.spaces.push(newSpace);

  // Update user in the database
  const updated = updateUser(user);
  if (!updated) {
    throw new Error("Failed to create space");
  }

  return newSpace;
}

// Update a space for a user
export function updateSpace(mobileNumber, spaceId, spaceData) {
  const user = findByMobileNumber(mobileNumber);
  if (!user) {
    throw new Error("User not found");
  }

  // Find the space to update
  const spaceIndex = user.spaces.findIndex((space) => space.id === spaceId);
  if (spaceIndex === -1) {
    throw new Error("Space not found");
  }

  // If space name is being changed, check for uniqueness
  if (
    spaceData.space_name &&
    spaceData.space_name !== user.spaces[spaceIndex].space_name
  ) {
    const nameExists = user.spaces.some(
      (space, idx) =>
        idx !== spaceIndex && space.space_name === spaceData.space_name
    );

    if (nameExists) {
      throw new Error(
        `Space with name '${spaceData.space_name}' already exists for this user`
      );
    }
  }

  // Update the space
  user.spaces[spaceIndex] = {
    ...user.spaces[spaceIndex],
    ...spaceData,
    updated_at: new Date().toISOString(),
  };

  // Update user in the database
  const updated = updateUser(user);
  if (!updated) {
    throw new Error("Failed to update space");
  }

  return user.spaces[spaceIndex];
}

// Delete a space for a user
export function deleteSpace(mobileNumber, spaceId) {
  const user = findByMobileNumber(mobileNumber);
  if (!user) {
    throw new Error("User not found");
  }

  // Ensure we're not deleting the last space
  if (user.spaces.length <= 1) {
    throw new Error(
      "Cannot delete the only space. Users must have at least one space."
    );
  }

  // Find the space to delete
  const spaceIndex = user.spaces.findIndex((space) => space.id === spaceId);
  if (spaceIndex === -1) {
    throw new Error("Space not found");
  }

  // Remove the space
  user.spaces.splice(spaceIndex, 1);

  // Update user in the database
  const updated = updateUser(user);
  if (!updated) {
    throw new Error("Failed to delete space");
  }

  return { success: true, message: "Space deleted successfully" };
}
