const dangerousPattern = /[<>\\{}\[\]\^`]/g;

export const sanitizeInput = (input: string): string => input.replace(dangerousPattern, '').trim();
