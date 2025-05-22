#!/bin/bash

# ANSI color codes for formatting output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[0;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}=======================================${NC}"
echo -e "${BLUE}  Quantum-Safe Chat - Test Runner     ${NC}"
echo -e "${BLUE}=======================================${NC}"

# Function to check if a command exists
command_exists() {
  command -v "$1" >/dev/null 2>&1
}

# Check for required dependencies
echo -e "\n${YELLOW}Checking dependencies...${NC}"

MISSING_DEPS=0

# Check for Python and pytest
if command_exists python3; then
  echo -e "✓ Python 3 is installed"
  
  # Check for pytest
  if python3 -c "import pytest" 2>/dev/null; then
    echo -e "✓ pytest is installed"
  else
    echo -e "${RED}✗ pytest is not installed. Please install with: pip install pytest${NC}"
    MISSING_DEPS=1
  fi
  
  # Check for pytest-asyncio (for async tests)
  if python3 -c "import pytest_asyncio" 2>/dev/null; then
    echo -e "✓ pytest-asyncio is installed"
  else
    echo -e "${RED}✗ pytest-asyncio is not installed. Please install with: pip install pytest-asyncio${NC}"
    MISSING_DEPS=1
  fi
else
  echo -e "${RED}✗ Python 3 is not installed${NC}"
  MISSING_DEPS=1
fi

# Check for Node.js and npm
if command_exists node; then
  echo -e "✓ Node.js is installed"
  
  # Check for npm
  if command_exists npm; then
    echo -e "✓ npm is installed"
    
    # Check for Jest
    if npm list -g jest >/dev/null 2>&1 || npm list jest >/dev/null 2>&1; then
      echo -e "✓ Jest is installed"
    else
      echo -e "${RED}✗ Jest is not installed. Please install with: npm install --save-dev jest${NC}"
      MISSING_DEPS=1
    fi
  else
    echo -e "${RED}✗ npm is not installed${NC}"
    MISSING_DEPS=1
  fi
else
  echo -e "${RED}✗ Node.js is not installed${NC}"
  MISSING_DEPS=1
fi

# Exit if dependencies are missing
if [ $MISSING_DEPS -ne 0 ]; then
  echo -e "\n${RED}Please install missing dependencies before running tests.${NC}"
  exit 1
fi

# Create a results directory if it doesn't exist
RESULTS_DIR="test_results"
mkdir -p $RESULTS_DIR

# Get current date and time for report filenames
DATE_TIME=$(date +"%Y%m%d_%H%M%S")

# Run backend tests
echo -e "\n${YELLOW}Running backend Python tests...${NC}"
BACKEND_RESULT=0
BACKEND_OUTPUT_FILE="$RESULTS_DIR/backend_test_results_$DATE_TIME.txt"
python3 -m pytest tests/backend -v | tee $BACKEND_OUTPUT_FILE
BACKEND_RESULT=${PIPESTATUS[0]}

if [ $BACKEND_RESULT -eq 0 ]; then
  echo -e "\n${GREEN}✓ Backend tests passed${NC}"
else
  echo -e "\n${RED}✗ Backend tests failed${NC}"
fi

# Run frontend tests
echo -e "\n${YELLOW}Running frontend JavaScript tests...${NC}"
FRONTEND_RESULT=0
FRONTEND_OUTPUT_FILE="$RESULTS_DIR/frontend_test_results_$DATE_TIME.txt"

# Check if package.json exists and has a test script
if [ -f "package.json" ]; then
  if grep -q "\"test\":" package.json; then
    npm test | tee $FRONTEND_OUTPUT_FILE
    FRONTEND_RESULT=${PIPESTATUS[0]}
  else
    echo -e "${YELLOW}No test script found in package.json, using Jest directly${NC}"
    npx jest tests/frontend --testEnvironment=jsdom | tee $FRONTEND_OUTPUT_FILE
    FRONTEND_RESULT=${PIPESTATUS[0]}
  fi
else
  echo -e "${YELLOW}No package.json found, using Jest directly${NC}"
  npx jest tests/frontend --testEnvironment=jsdom | tee $FRONTEND_OUTPUT_FILE
  FRONTEND_RESULT=${PIPESTATUS[0]}
fi

if [ $FRONTEND_RESULT -eq 0 ]; then
  echo -e "\n${GREEN}✓ Frontend tests passed${NC}"
else
  echo -e "\n${RED}✗ Frontend tests failed${NC}"
fi

# Summary
echo -e "\n${BLUE}=======================================${NC}"
echo -e "${BLUE}             Test Summary             ${NC}"
echo -e "${BLUE}=======================================${NC}"

TOTAL_RESULT=0
if [ $BACKEND_RESULT -eq 0 ] && [ $FRONTEND_RESULT -eq 0 ]; then
  echo -e "\n${GREEN}All tests passed successfully!${NC}"
else
  echo -e "\n${RED}Some tests failed.${NC}"
  TOTAL_RESULT=1
  
  if [ $BACKEND_RESULT -ne 0 ]; then
    echo -e "${RED}Backend tests failed. See $BACKEND_OUTPUT_FILE for details.${NC}"
  fi
  
  if [ $FRONTEND_RESULT -ne 0 ]; then
    echo -e "${RED}Frontend tests failed. See $FRONTEND_OUTPUT_FILE for details.${NC}"
  fi
fi

echo -e "\nBackend test results saved to: $BACKEND_OUTPUT_FILE"
echo -e "Frontend test results saved to: $FRONTEND_OUTPUT_FILE"

# Exit with appropriate code
exit $TOTAL_RESULT