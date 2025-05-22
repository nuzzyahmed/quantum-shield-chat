#!/usr/bin/env python3
"""
Quantum-Safe Chat - Test Runner
This script runs all the tests for the Quantum-Safe Chat application,
including both backend (Python) and frontend (JavaScript) tests.
"""

import os
import sys
import subprocess
import datetime
import shutil
import platform

# ANSI color codes for formatting output
class Colors:
    GREEN = '\033[0;32m'
    RED = '\033[0;31m'
    YELLOW = '\033[0;33m'
    BLUE = '\033[0;34m'
    NC = '\033[0m'  # No Color

# For Windows compatibility
if platform.system() == 'Windows':
    os.system('color')

def print_header(text):
    """Print a formatted header."""
    print(f"\n{Colors.BLUE}{'=' * 39}{Colors.NC}")
    print(f"{Colors.BLUE}  {text}  {Colors.NC}")
    print(f"{Colors.BLUE}{'=' * 39}{Colors.NC}")

def print_status(message, success=True):
    """Print a status message with appropriate color."""
    if success:
        print(f"✓ {message}")
    else:
        print(f"{Colors.RED}✗ {message}{Colors.NC}")

def check_dependencies():
    """Check if required dependencies are installed."""
    print(f"\n{Colors.YELLOW}Checking dependencies...{Colors.NC}")
    missing_deps = False
    
    # Check Python and related packages
    if shutil.which('python3') or shutil.which('python'):
        print_status("Python is installed")
        
        try:
            import pytest
            print_status("pytest is installed")
        except ImportError:
            print_status("pytest is not installed. Please install with: pip install pytest", False)
            missing_deps = True
            
        try:
            import pytest_asyncio
            print_status("pytest-asyncio is installed")
        except ImportError:
            print_status("pytest-asyncio is not installed. Please install with: pip install pytest-asyncio", False)
            missing_deps = True
    else:
        print_status("Python is not installed", False)
        missing_deps = True
    
    # Check Node.js and npm
    if shutil.which('node'):
        print_status("Node.js is installed")
        
        if shutil.which('npm'):
            print_status("npm is installed")
            
            # Check for Jest (simplistic check)
            try:
                npm_list = subprocess.run(['npm', 'list', 'jest'], 
                                        stdout=subprocess.PIPE, 
                                        stderr=subprocess.PIPE,
                                        text=True)
                if npm_list.returncode == 0 or 'jest' in npm_list.stdout:
                    print_status("Jest is installed")
                else:
                    # Try global Jest
                    npm_list_g = subprocess.run(['npm', 'list', '-g', 'jest'], 
                                             stdout=subprocess.PIPE, 
                                             stderr=subprocess.PIPE,
                                             text=True)
                    if npm_list_g.returncode == 0 or 'jest' in npm_list_g.stdout:
                        print_status("Jest is installed (globally)")
                    else:
                        print_status("Jest is not installed. Please install with: npm install --save-dev jest", False)
                        missing_deps = True
            except Exception:
                print_status("Error checking for Jest installation", False)
                missing_deps = True
        else:
            print_status("npm is not installed", False)
            missing_deps = True
    else:
        print_status("Node.js is not installed", False)
        missing_deps = True
    
    return not missing_deps

def run_backend_tests():
    """Run the Python backend tests."""
    print(f"\n{Colors.YELLOW}Running backend Python tests...{Colors.NC}")
    
    # Create results directory if it doesn't exist
    results_dir = "test_results"
    os.makedirs(results_dir, exist_ok=True)
    
    # Generate output filename with timestamp
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    output_file = os.path.join(results_dir, f"backend_test_results_{timestamp}.txt")
    
    # Run pytest
    command = ["python", "-m", "pytest", "tests/backend", "-v"]
    
    try:
        with open(output_file, 'w') as f:
            process = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
            f.write(process.stdout)
        
        # Also print to console
        print(process.stdout)
        
        if process.returncode == 0:
            print(f"\n{Colors.GREEN}✓ Backend tests passed{Colors.NC}")
            return True, output_file
        else:
            print(f"\n{Colors.RED}✗ Backend tests failed{Colors.NC}")
            return False, output_file
            
    except Exception as e:
        print(f"{Colors.RED}Error running backend tests: {str(e)}{Colors.NC}")
        return False, output_file

def run_frontend_tests():
    """Run the JavaScript frontend tests."""
    print(f"\n{Colors.YELLOW}Running frontend JavaScript tests...{Colors.NC}")
    
    # Create results directory if it doesn't exist
    results_dir = "test_results"
    os.makedirs(results_dir, exist_ok=True)
    
    # Generate output filename with timestamp
    timestamp = datetime.datetime.now().strftime("%Y%m%d_%H%M%S")
    output_file = os.path.join(results_dir, f"frontend_test_results_{timestamp}.txt")
    
    # Determine how to run the tests
    if os.path.exists('package.json'):
        import json
        with open('package.json') as f:
            try:
                package_data = json.load(f)
                if 'scripts' in package_data and 'test' in package_data['scripts']:
                    command = ['npm', 'test']
                else:
                    print(f"{Colors.YELLOW}No test script found in package.json, using Jest directly{Colors.NC}")
                    command = ['npx', 'jest', 'tests/frontend', '--testEnvironment=jsdom']
            except json.JSONDecodeError:
                print(f"{Colors.YELLOW}Invalid package.json, using Jest directly{Colors.NC}")
                command = ['npx', 'jest', 'tests/frontend', '--testEnvironment=jsdom']
    else:
        print(f"{Colors.YELLOW}No package.json found, using Jest directly{Colors.NC}")
        command = ['npx', 'jest', 'tests/frontend', '--testEnvironment=jsdom']
    
    try:
        with open(output_file, 'w') as f:
            process = subprocess.run(command, stdout=subprocess.PIPE, stderr=subprocess.STDOUT, text=True)
            f.write(process.stdout)
        
        # Also print to console
        print(process.stdout)
        
        if process.returncode == 0:
            print(f"\n{Colors.GREEN}✓ Frontend tests passed{Colors.NC}")
            return True, output_file
        else:
            print(f"\n{Colors.RED}✗ Frontend tests failed{Colors.NC}")
            return False, output_file
            
    except Exception as e:
        print(f"{Colors.RED}Error running frontend tests: {str(e)}{Colors.NC}")
        return False, output_file

def main():
    print_header("Quantum-Safe Chat - Test Runner")
    
    if not check_dependencies():
        print(f"\n{Colors.RED}Please install missing dependencies before running tests.{Colors.NC}")
        sys.exit(1)
    
    # Run the tests
    backend_success, backend_output = run_backend_tests()
    frontend_success, frontend_output = run_frontend_tests()
    
    # Print summary
    print_header("Test Summary")
    
    if backend_success and frontend_success:
        print(f"\n{Colors.GREEN}All tests passed successfully!{Colors.NC}")
        exit_code = 0
    else:
        print(f"\n{Colors.RED}Some tests failed.{Colors.NC}")
        exit_code = 1
        
        if not backend_success:
            print(f"{Colors.RED}Backend tests failed. See {backend_output} for details.{Colors.NC}")
        
        if not frontend_success:
            print(f"{Colors.RED}Frontend tests failed. See {frontend_output} for details.{Colors.NC}")
    
    print(f"\nBackend test results saved to: {backend_output}")
    print(f"Frontend test results saved to: {frontend_output}")
    
    sys.exit(exit_code)

if __name__ == "__main__":
    main()