#!/usr/bin/env python3
"""
ConnectChat Extended Backend Testing - Full Workflow Test
Creates test users and tests complete chat workflow
"""

import requests
import sys
import json
import time
from datetime import datetime
from typing import Dict, List, Optional

class ExtendedConnectChatTester:
    def __init__(self, base_url="https://chat-connect-hub-2.preview.emergentagent.com"):
        self.base_url = base_url
        self.api_url = f"{base_url}/api"
        self.tests_run = 0
        self.tests_passed = 0
        self.test_results = []
        
        # Test users
        timestamp = datetime.now().strftime('%H%M%S')
        self.user1 = {
            "email": f"user1_{timestamp}@example.com",
            "password": "password123",
            "username": f"user1_{timestamp}",
            "token": None,
            "id": None
        }
        
        self.user2 = {
            "email": f"user2_{timestamp}@example.com", 
            "password": "password123",
            "username": f"user2_{timestamp}",
            "token": None,
            "id": None
        }

    def log_test(self, name: str, success: bool, details: str = ""):
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
            "details": details
        })

    def make_request(self, method: str, endpoint: str, data: dict = None, token: str = None, expected_status: int = 200) -> tuple:
        """Make HTTP request"""
        url = f"{self.api_url}/{endpoint}"
        headers = {'Content-Type': 'application/json'}
        
        if token:
            headers['Authorization'] = f'Bearer {token}'

        try:
            if method == 'GET':
                response = requests.get(url, headers=headers, timeout=10)
            elif method == 'POST':
                response = requests.post(url, json=data, headers=headers, timeout=10)
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

    def register_and_login_user(self, user_data: dict) -> bool:
        """Register and login a user"""
        # Register
        success, response = self.make_request('POST', 'auth/register', user_data, expected_status=200)
        if not success:
            self.log_test(f"Register {user_data['username']}", False, f"Registration failed: {response}")
            return False
        
        user_data['token'] = response['access_token']
        user_data['id'] = response['user']['id']
        self.log_test(f"Register {user_data['username']}", True, f"User ID: {user_data['id']}")
        return True

    def test_user_search_between_users(self):
        """Test that users can find each other"""
        # User1 searches for User2
        success, response = self.make_request('GET', f'users/search?query={self.user2["username"][:4]}', 
                                            token=self.user1['token'])
        
        if success and isinstance(response, list) and len(response) > 0:
            found_user2 = any(u['id'] == self.user2['id'] for u in response)
            if found_user2:
                self.log_test("User Search", True, f"User1 found User2 in search results")
                return True
            else:
                self.log_test("User Search", False, "User2 not found in search results")
                return False
        else:
            self.log_test("User Search", False, f"Search failed: {response}")
            return False

    def test_chat_request_workflow(self):
        """Test complete chat request workflow"""
        # User1 sends chat request to User2
        request_data = {
            "receiver_id": self.user2['id'],
            "message": "Hello! Would you like to chat?"
        }
        
        success, response = self.make_request('POST', 'chat-requests', request_data, 
                                            token=self.user1['token'], expected_status=200)
        
        if not success:
            self.log_test("Send Chat Request", False, f"Failed to send request: {response}")
            return False, None
        
        request_id = response['id']
        self.log_test("Send Chat Request", True, f"Request ID: {request_id}")
        
        # User2 checks pending requests
        success, response = self.make_request('GET', 'chat-requests', token=self.user2['token'])
        
        if not success or not isinstance(response, list):
            self.log_test("Get Chat Requests", False, f"Failed to get requests: {response}")
            return False, None
        
        # Find the request from User1
        user1_request = None
        for req in response:
            if req['sender_id'] == self.user1['id']:
                user1_request = req
                break
        
        if not user1_request:
            self.log_test("Get Chat Requests", False, "Request from User1 not found")
            return False, None
        
        self.log_test("Get Chat Requests", True, f"Found request from {user1_request['sender_username']}")
        
        # User2 accepts the request
        success, response = self.make_request('POST', f'chat-requests/{request_id}/accept', {}, 
                                            token=self.user2['token'], expected_status=200)
        
        if not success:
            self.log_test("Accept Chat Request", False, f"Failed to accept: {response}")
            return False, None
        
        conversation_id = response['id']
        self.log_test("Accept Chat Request", True, f"Created conversation: {conversation_id}")
        
        return True, conversation_id

    def test_messaging_workflow(self, conversation_id: str):
        """Test complete messaging workflow"""
        # User1 sends a message
        message_data = {
            "conversation_id": conversation_id,
            "content": "Hello! This is my first message."
        }
        
        success, response = self.make_request('POST', 'messages', message_data, 
                                            token=self.user1['token'], expected_status=200)
        
        if not success:
            self.log_test("Send Message (User1)", False, f"Failed to send: {response}")
            return False
        
        message1_id = response['id']
        self.log_test("Send Message (User1)", True, f"Message: {response['content']}")
        
        # User2 sends a reply
        reply_data = {
            "conversation_id": conversation_id,
            "content": "Hi there! Nice to meet you!"
        }
        
        success, response = self.make_request('POST', 'messages', reply_data, 
                                            token=self.user2['token'], expected_status=200)
        
        if not success:
            self.log_test("Send Message (User2)", False, f"Failed to send: {response}")
            return False
        
        message2_id = response['id']
        self.log_test("Send Message (User2)", True, f"Reply: {response['content']}")
        
        # Both users get messages
        success, response = self.make_request('GET', f'messages/{conversation_id}', 
                                            token=self.user1['token'])
        
        if success and isinstance(response, list) and len(response) >= 2:
            self.log_test("Get Messages (User1)", True, f"Retrieved {len(response)} messages")
        else:
            self.log_test("Get Messages (User1)", False, f"Failed to get messages: {response}")
            return False
        
        # Test read receipts
        success, response = self.make_request('POST', f'messages/{message1_id}/read', {}, 
                                            token=self.user2['token'], expected_status=200)
        
        if success:
            self.log_test("Mark Message Read", True, "Message marked as read")
        else:
            self.log_test("Mark Message Read", False, f"Failed to mark read: {response}")
        
        return True

    def test_conversation_management(self):
        """Test conversation listing and management"""
        # Both users get their conversations
        for user_name, user_data in [("User1", self.user1), ("User2", self.user2)]:
            success, response = self.make_request('GET', 'conversations', token=user_data['token'])
            
            if success and isinstance(response, list):
                self.log_test(f"Get Conversations ({user_name})", True, 
                            f"Has {len(response)} conversations")
            else:
                self.log_test(f"Get Conversations ({user_name})", False, 
                            f"Failed to get conversations: {response}")

    def test_group_conversation(self):
        """Test group conversation creation"""
        group_data = {
            "participant_ids": [self.user2['id']],
            "is_group": True,
            "name": f"Test Group {datetime.now().strftime('%H:%M:%S')}"
        }
        
        success, response = self.make_request('POST', 'conversations', group_data, 
                                            token=self.user1['token'], expected_status=200)
        
        if success and response.get('is_group'):
            self.log_test("Create Group Conversation", True, f"Group: {response['name']}")
            return True, response['id']
        else:
            self.log_test("Create Group Conversation", False, f"Failed: {response}")
            return False, None

    def run_extended_tests(self):
        """Run comprehensive workflow tests"""
        print("🚀 Starting Extended ConnectChat Testing")
        print("=" * 50)
        
        # Register both test users
        print("\n👥 Setting up test users...")
        if not self.register_and_login_user(self.user1):
            return False
        
        if not self.register_and_login_user(self.user2):
            return False
        
        # Test user search
        print("\n🔍 Testing user discovery...")
        if not self.test_user_search_between_users():
            return False
        
        # Test chat request workflow
        print("\n🤝 Testing chat request workflow...")
        request_success, conversation_id = self.test_chat_request_workflow()
        
        if not request_success:
            return False
        
        # Test messaging
        print("\n💬 Testing messaging workflow...")
        if not self.test_messaging_workflow(conversation_id):
            return False
        
        # Test conversation management
        print("\n📋 Testing conversation management...")
        self.test_conversation_management()
        
        # Test group conversations
        print("\n👥 Testing group conversations...")
        group_success, group_id = self.test_group_conversation()
        
        if group_success:
            # Send a message in the group
            group_message = {
                "conversation_id": group_id,
                "content": "Hello group!"
            }
            success, response = self.make_request('POST', 'messages', group_message, 
                                                token=self.user1['token'], expected_status=200)
            if success:
                self.log_test("Send Group Message", True, "Group message sent")
            else:
                self.log_test("Send Group Message", False, f"Failed: {response}")
        
        # Print summary
        print("\n" + "=" * 50)
        print(f"📊 Extended Test Summary: {self.tests_passed}/{self.tests_run} tests passed")
        
        success_rate = (self.tests_passed / self.tests_run * 100) if self.tests_run > 0 else 0
        
        if success_rate >= 90:
            print("🎉 Extended tests mostly successful!")
            return True
        else:
            print(f"⚠️  {self.tests_run - self.tests_passed} tests failed")
            return False

def main():
    """Main test execution"""
    tester = ExtendedConnectChatTester()
    
    try:
        success = tester.run_extended_tests()
        
        # Save results
        results = {
            "timestamp": datetime.now().isoformat(),
            "test_type": "extended_workflow",
            "total_tests": tester.tests_run,
            "passed_tests": tester.tests_passed,
            "success_rate": (tester.tests_passed / tester.tests_run * 100) if tester.tests_run > 0 else 0,
            "test_details": tester.test_results
        }
        
        with open('/app/extended_backend_test_results.json', 'w') as f:
            json.dump(results, f, indent=2)
        
        return 0 if success else 1
        
    except Exception as e:
        print(f"❌ Extended test execution failed: {str(e)}")
        return 1

if __name__ == "__main__":
    sys.exit(main())