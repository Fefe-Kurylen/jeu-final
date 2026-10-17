// Shared test environment: the config module must not require a real secret or a database here
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'unit-test-secret-0123456789abcdef0123456789abcdef';
