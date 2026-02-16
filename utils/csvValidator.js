/**
 * CSV Validator for Bulk Instructor Upload
 * Validates instructor data from CSV rows
 */

// RFC 5322 compliant email regex (simplified version)
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Name regex: letters, spaces, hyphens, apostrophes, periods (for titles like Dr., Jr., etc.)
const NAME_REGEX = /^[a-zA-Z\s'.-]+$/;

// Phone regex: flexible format (E.164 or common formats)
const PHONE_REGEX = /^\+?[\d\s()-]{7,20}$/;

/**
 * Validate a single instructor record
 * @param {Object} data - Instructor data from CSV row
 * @param {number} rowNumber - Row number for error reporting
 * @returns {Object} - { valid: boolean, errors: string[] }
 */
export const validateInstructorData = (data, rowNumber) => {
  const errors = [];

  // 1. Required Fields Check
  if (!data.fullName || data.fullName.trim() === '') {
    errors.push(`Row ${rowNumber}: fullName is required`);
  }

  if (!data.email || data.email.trim() === '') {
    errors.push(`Row ${rowNumber}: email is required`);
  }

  if (!data.subject || data.subject.trim() === '') {
    errors.push(`Row ${rowNumber}: subject is required`);
  }

  // 2. Full Name Validation
  if (data.fullName) {
    const trimmedName = data.fullName.trim();
    
    if (trimmedName.length < 2) {
      errors.push(`Row ${rowNumber}: fullName must be at least 2 characters`);
    }
    
    if (trimmedName.length > 100) {
      errors.push(`Row ${rowNumber}: fullName must not exceed 100 characters`);
    }
    
    if (!NAME_REGEX.test(trimmedName)) {
      errors.push(`Row ${rowNumber}: fullName contains invalid characters (only letters, spaces, hyphens, apostrophes, and periods allowed)`);
    }
  }

  // 3. Email Validation
  if (data.email) {
    const trimmedEmail = data.email.trim();
    
    if (!EMAIL_REGEX.test(trimmedEmail)) {
      errors.push(`Row ${rowNumber}: invalid email format`);
    }
    
    if (trimmedEmail.length > 255) {
      errors.push(`Row ${rowNumber}: email must not exceed 255 characters`);
    }
  }

  // 4. Subject Validation
  if (data.subject) {
    const trimmedSubject = data.subject.trim();
    
    if (trimmedSubject.length < 2) {
      errors.push(`Row ${rowNumber}: subject must be at least 2 characters`);
    }
    
    if (trimmedSubject.length > 200) {
      errors.push(`Row ${rowNumber}: subject must not exceed 200 characters`);
    }
  }

  // 5. Phone Validation (optional field)
  if (data.phone && data.phone.trim() !== '') {
    const trimmedPhone = data.phone.trim();
    
    if (!PHONE_REGEX.test(trimmedPhone)) {
      errors.push(`Row ${rowNumber}: invalid phone number format`);
    }
    
    if (trimmedPhone.length > 20) {
      errors.push(`Row ${rowNumber}: phone must not exceed 20 characters`);
    }
  }

  // 6. Bio Validation (optional field)
  if (data.bio && data.bio.trim() !== '') {
    const trimmedBio = data.bio.trim();
    
    if (trimmedBio.length > 1000) {
      errors.push(`Row ${rowNumber}: bio must not exceed 1000 characters`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
};

/**
 * Normalize instructor data (trim, lowercase email, etc.)
 * @param {Object} data - Raw instructor data
 * @returns {Object} - Normalized data
 */
export const normalizeInstructorData = (data) => {
  return {
    fullName: data.fullName ? data.fullName.trim() : '',
    email: data.email ? data.email.trim().toLowerCase() : '',
    subject: data.subject ? data.subject.trim() : '',
    phone: data.phone && data.phone.trim() !== '' ? data.phone.trim() : null,
    bio: data.bio && data.bio.trim() !== '' ? data.bio.trim() : null,
  };
};

/**
 * Validate entire CSV data array
 * @param {Array} instructors - Array of instructor data objects
 * @returns {Object} - { valid: boolean, errors: Array, validData: Array }
 */
export const validateBulkInstructors = (instructors) => {
  const allErrors = [];
  const validData = [];
  const emailsSeen = new Set();

  instructors.forEach((instructor, index) => {
    const rowNumber = index + 2; // +2 because row 1 is header
    
    // Normalize data first
    const normalized = normalizeInstructorData(instructor);
    
    // Validate
    const { valid, errors } = validateInstructorData(normalized, rowNumber);
    
    if (!valid) {
      allErrors.push(...errors);
    } else {
      // Check for duplicate emails within CSV
      if (emailsSeen.has(normalized.email)) {
        allErrors.push(`Row ${rowNumber}: duplicate email in CSV (${normalized.email})`);
      } else {
        emailsSeen.add(normalized.email);
        validData.push({ ...normalized, rowNumber });
      }
    }
  });

  return {
    valid: allErrors.length === 0,
    errors: allErrors,
    validData
  };
};