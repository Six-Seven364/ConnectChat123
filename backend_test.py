#!/usr/bin/env python3
"""
ConnectChat Backend API Testing Suite
Tests all authentication, user management, conversation, messaging, and chat request endpoints
"""

import requests
import sys
import json
from datetime import datetime
from typing import Dict, List, Optional

class ConnectChatAPITester:
    def __init__(self, base_url="https://chat-connect-hub-2.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.token = None
        self.user_id = None
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []
        
        # Test data
        self.test_user = {
            "email": "test@example.com",
            "password": "test123",
            "username": "testuser"
        }
        
        self.new_user = {
            "email": f"newuser_{datetime.now().strftime('%H%M%S')}@example.com",
            "password": "newpass123",
            "username": f"newuser_{datetime.now().strftime('%H%M%S')}"
        }

    def log_test(self, name: str, success: bool, details: str = "", response_data: dict = None):
        """Log test result"""
        self.tests_run += 1
        if success:
            self.tests_passed += 1
            print(f"✅ {name}")
        else:
            print(f"❌ {name} - {details}")
        
        self.test_results.append({
            "name": name,
            "success": success,
            "details": details,
            "response_data": response_data
        })

    def make_request(self, method: str, endpoint: str, data: dict = None, expected_status: int = 200) -> tuple:
        """Make HTTP request and return success status and response"""
        url = f"{self.api_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        
        if self.token:
            headers['Authorization'] = f'Bearer {self.token}'

        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=10)
            elif method == 'PUT':
                response = requests.put(url, json=data, headers=headers, timeout=10)
            elif method == 'DELETE':
                response = requests.delete(url, headers=headers, timeout=10)
            else:
                return False, {"error": f"Unsupported method: {method}"}

            success = response.status_code == expected_status
            try:
                response_data = response.json()
            except:
                response_data = {"status_code": response.status_code, "text": response.text}

            return success, response_data

        except Exception as e:
            return False, {"error": str(e)}

    def test_health_check(self):
        """Test API health endpoint"""
        success, response = self.make_request('GET', 'health')
        self.log_test("Health Check", success, 
                     "" if success else f"Health check failed: {response}", response)
        return success

    def test_user_registration(self):
        """Test user registration"""
        success, response = self.make_request('POST', 'auth/register', self.new_user, 200)
        
        if success and 'access_token' in response:
            self.log_test("User Registration", True, "New user registered successfully")
            return True, response
        else:
            self.log_test("User Registration", False, 
                         f"Registration failed: {response.get('detail', 'Unknown error')}", response)
            return False, response

    def test_user_login(self):
        """Test user login with existing test user"""
        login_data = {"email": self.test_user["email"], "password": self.test_user["password"]}
        success, response = self.make_request('POST', 'auth/login', login_data, 200)
        
        if success and 'access_token' in response:
            self.token = response['access_token']
            self.user_id = response['user']['id']
            self.log_test("User Login", True, "Login successful")
            return True
        else:
            self.log_test("User Login", False, 
                         f"Login failed: {response.get('detail', 'Unknown error')}", response)
            return False

    def test_get_current_user(self):
        """Test getting current user profile"""
        if not self.token:
            self.log_test("Get Current User", False, "No token available")
            return False
            
        success, response = self.make_request('GET', 'auth/me')
        
        if success and 'id' in response:
            self.log_test("Get Current User", True, f"Retrieved user: {response.get('username')}")
            return True
        else:
            self.log_test("Get Current User", False, 
                         f"Failed to get user: {response.get('detail', 'Unknown error')}", response)
            return False

    def test_search_users(self):
        """Test user search functionality"""
        if not self.token:
            self.log_test("Search Users", False, "No token available")
            return False, []
            
        success, response = self.make_request('GET', 'users/search?query=test')
        
        if success and isinstance(response, list):
            self.log_test("Search Users", True, f"Found {len(response)} users")
            return True, response
        else:
            self.log_test("Search Users", False, 
                         f"Search failed: {response.get('detail', 'Unknown error')}", response)
            return False, []

    def test_create_private_conversation(self, target_user_id: str):
        """Test creating a private conversation"""
        if not self.token:
            self.log_test("Create Private Conversation", False, "No token available")
            return False, None
            
        conv_data = {
            "participant_ids": [target_user_id],
            "is_group": False
        }
        
        success, response = self.make_request('POST', 'conversations', conv_data, 200)
        
        if success and 'id' in response:
            self.log_test("Create Private Conversation", True, f"Created conversation: {response['id']}")
            return True, response
        else:
            self.log_test("Create Private Conversation", False, 
                         f"Failed to create conversation: {response.get('detail', 'Unknown error')}", response)
            return False, None

    def test_create_group_conversation(self, participant_ids: List[str]):
        """Test creating a group conversation"""
        if not self.token:
            self.log_test("Create Group Conversation", False, "No token available")
            return False, None
            
        conv_data = {
            "participant_ids": participant_ids,
            "is_group": True,
            "name": f"Test Group {datetime.now().strftime('%H%M%S')}"
        }
        
        success, response = self.make_request('POST', 'conversations', conv_data, 200)
        
        if success and 'id' in response:
            self.log_test("Create Group Conversation", True, f"Created group: {response['name']}")
            return True, response
        else:
            self.log_test("Create Group Conversation", False, 
                         f"Failed to create group: {response.get('detail', 'Unknown error')}", response)
            return False, None

    def test_get_conversations(self):
        """Test getting user's conversations"""
        if not self.token:
            self.log_test("Get Conversations", False, "No token available")
            return False, []
            
        success, response = self.make_request('GET', 'conversations')
        
        if success and isinstance(response, list):
            self.log_test("Get Conversations", True, f"Retrieved {len(response)} conversations")
            return True, response
        else:
            self.log_test("Get Conversations", False, 
                         f"Failed to get conversations: {response.get('detail', 'Unknown error')}", response)
            return False, []

    def test_send_message(self, conversation_id: str):
        """Test sending a message"""
        if not self.token:
            self.log_test("Send Message", False, "No token available")
            return False, None
            
        message_data = {
            "conversation_id": conversation_id,
            "content": f"Test message at {datetime.now().strftime('%H:%M:%S')}"
        }
        
        success, response = self.make_request('POST', 'messages', message_data, 200)
        
        if success and 'id' in response:
            self.log_test("Send Message", True, f"Sent message: {response['content']}")
            return True, response
        else:
            self.log_test("Send Message", False, 
                         f"Failed to send message: {response.get('detail', 'Unknown error')}", response)
            return False, None

    def test_get_messages(self, conversation_id: str):
        """Test getting messages from a conversation"""
        if not self.token:
            self.log_test("Get Messages", False, "No token available")
            return False, []
            
        success, response = self.make_request('GET', f'messages/{conversation_id}')
        
        if success and isinstance(response, list):
            self.log_test("Get Messages", True, f"Retrieved {len(response)} messages")
            return True, response
        else:
            self.log_test("Get Messages", False, 
                         f"Failed to get messages: {response.get('detail', 'Unknown error')}", response)
            return False, []

    def test_mark_message_read(self, message_id: str):
        """Test marking a message as read"""
        if not self.token:
            self.log_test("Mark Message Read", False, "No token available")
            return False
            
        success, response = self.make_request('POST', f'messages/{message_id}/read', {}, 200)
        
        if success:
            self.log_test("Mark Message Read", True, "Message marked as read")
            return True
        else:
            self.log_test("Mark Message Read", False, 
                         f"Failed to mark as read: {response.get('detail', 'Unknown error')}", response)
            return False

    def test_send_chat_request(self, receiver_id: str):
        """Test sending a chat request"""
        if not self.token:
            self.log_test("Send Chat Request", False, "No token available")
            return False, None
            
        request_data = {
            "receiver_id": receiver_id,
            "message": "Would you like to chat?"
        }
        
        success, response = self.make_request('POST', 'chat-requests', request_data, 200)
        
        if success and 'id' in response:
            self.log_test("Send Chat Request", True, f"Sent request to user: {receiver_id}")
            return True, response
        else:
            self.log_test("Send Chat Request", False, 
                         f"Failed to send request: {response.get('detail', 'Unknown error')}", response)
            return False, None

    def test_get_chat_requests(self):
        """Test getting pending chat requests"""
        if not self.token:
            self.log_test("Get Chat Requests", False, "No token available")
            return False, []
            
        success, response = self.make_request('GET', 'chat-requests')
        
        if success and isinstance(response, list):
            self.log_test("Get Chat Requests", True, f"Retrieved {len(response)} requests")
            return True, response
        else:
            self.log_test("Get Chat Requests", False, 
                         f"Failed to get requests: {response.get('detail', 'Unknown error')}", response)
            return False, []

    def test_accept_chat_request(self, request_id: str):
        """Test accepting a chat request"""
        if not self.token:
            self.log_test("Accept Chat Request", False, "No token available")
            return False, None
            
        success, response = self.make_request('POST', f'chat-requests/{request_id}/accept', {}, 200)
        
        if success and 'id' in response:
            self.log_test("Accept Chat Request", True, f"Accepted request, created conversation")
            return True, response
        else:
            self.log_test("Accept Chat Request", False, 
                         f"Failed to accept request: {response.get('detail', 'Unknown error')}", response)
            return False, None

    def test_reject_chat_request(self, request_id: str):
        """Test rejecting a chat request"""
        if not self.token:
            self.log_test("Reject Chat Request", False, "No token available")
            return False
            
        success, response = self.make_request('POST', f'chat-requests/{request_id}/reject', {}, 200)
        
        if success:
            self.log_test("Reject Chat Request", True, "Request rejected successfully")
            return True
        else:
            self.log_test("Reject Chat Request", False, 
                         f"Failed to reject request: {response.get('detail', 'Unknown error')}", response)
            return False

    def run_comprehensive_test(self):
        """Run all tests in sequence"""
        print("🚀 Starting ConnectChat API Testing Suite")
        print("=" * 50)
        
        # Basic health check
        if not self.test_health_check():
            print("❌ API is not healthy, stopping tests")
            return False
        
        # Authentication tests
        print("\n📝 Testing Authentication...")
        if not self.test_user_login():
            print("❌ Login failed, stopping tests")
            return False
        
        self.test_get_current_user()
        
        # User management tests
        print("\n👥 Testing User Management...")
        search_success, users = self.test_search_users()
        
        # Conversation tests
        print("\n💬 Testing Conversations...")
        conv_success, conversations = self.test_get_conversations()
        
        # If we have users from search, test conversation creation
        if search_success and users:
            target_user = users[0]
            conv_success, conversation = self.test_create_private_conversation(target_user['id'])
            
            if conv_success and conversation:
                # Test messaging
                print("\n📨 Testing Messaging...")
                msg_success, message = self.test_send_message(conversation['id'])
                self.test_get_messages(conversation['id'])
                
                if msg_success and message:
                    self.test_mark_message_read(message['id'])
        
        # Chat request tests
        print("\n🤝 Testing Chat Requests...")
        self.test_get_chat_requests()
        
        # If we have users, test sending a chat request
        if search_success and users and len(users) > 1:
            target_user = users[1]  # Use second user to avoid self-request
            req_success, request = self.test_send_chat_request(target_user['id'])
        
        # Registration test (do this last to avoid affecting other tests)
        print("\n🆕 Testing Registration...")
        self.test_user_registration()
        
        # Print summary
        print("\n" + "=" * 50)
        print(f"📊 Test Summary: {self.tests_passed}/{self.tests_run} tests passed")
        
        if self.tests_passed == self.tests_run:
            print("🎉 All tests passed!")
            return True
        else:
            print(f"⚠️  {self.tests_run - self.tests_passed} tests failed")
            return False

def main():
    """Main test execution"""
    tester = ConnectChatAPITester()
    
    try:
        success = tester.run_comprehensive_test()
        
        # Save detailed results
        results = {
            "timestamp": datetime.now().isoformat(),
            "total_tests": tester.tests_run,
            "passed_tests": tester.tests_passed,
            "success_rate": (tester.tests_passed / tester.tests_run * 100) if tester.tests_run > 0 else 0,
            "test_details": tester.test_results
        }
        
        with open('/app/backend_test_results.json', 'w') as f:
            json.dump(results, f, indent=2)
        
        return 0 if success else 1
        
    except Exception as e:
        print(f"❌ Test execution failed: {str(e)}")
        return 1

if __name__ == "__main__":
    sys.exit(main())