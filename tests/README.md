# Quantum-Safe Chat Test Suite

This directory contains comprehensive unit tests for the Quantum-Safe Chat application, covering both backend (Python) and frontend (JavaScript) components.

## Test Structure

```
tests/
├── backend/
│   ├── test_app.py                 # Tests for FastAPI routes (registration, login, etc.)
│   ├── test_connection_manager.py  # Tests for WebSocket connection management
│   └── test_websocket_handler.py   # Tests for WebSocket message processing
├── frontend/
│   ├── test_encryption.js          # Tests for encryption/decryption operations
│   ├── test_message_handling.js    # Tests for processing messages
│   ├── test_user_interface.js      # Tests for UI components
│   └── test_websocket_client.js    # Tests for WebSocket client functionality
└── README.md                       # This file
```

## Running Tests

### Option 1: Using the test runner script

The easiest way to run all tests is using the test runner script. From the project root:

```bash
# Shell script version
chmod +x run_tests.sh
./run_tests.sh

# Or Python version
python run_tests.py
```

This will:
1. Check for required dependencies
2. Run all backend and frontend tests
3. Save detailed test outputs to the `test_results/` directory
4. Display a summary of test results

### Option 2: Running tests manually

#### Backend Tests

To run the backend tests:

```bash
# Run all backend tests
python -m pytest tests/backend -v

# Run a specific test file
python -m pytest tests/backend/test_app.py -v

# Run a specific test function
python -m pytest tests/backend/test_app.py::test_login -v
```

#### Frontend Tests

To run the frontend tests:

```bash
# Run all frontend tests
npx jest tests/frontend --testEnvironment=jsdom

# Run a specific test file
npx jest tests/frontend/test_encryption.js --testEnvironment=jsdom

# Run tests matching a pattern
npx jest -t "WebSocket Client" --testEnvironment=jsdom
```