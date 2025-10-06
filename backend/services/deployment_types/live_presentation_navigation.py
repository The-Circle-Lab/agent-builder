"""
Group Submission Navigation functions for Live Presentation
These functions handle navigation through group member submissions during live presentations.
"""

from typing import Dict, Any, List, Optional
import json


async def send_navigation_prompt_to_students(self, prompt_data: Dict[str, Any]):
    """
    Send a group submission navigation prompt to students.
    This prompt allows students to navigate through and edit group member submissions.
    """
    print(f"🧭 Sending navigation prompt for submission: {prompt_data.get('submissionPromptId')}")
    
    # Extract navigation configuration
    enable_navigation = prompt_data.get('enableGroupSubmissionNavigation', False)
    submission_prompt_id = prompt_data.get('submissionPromptId')
    allow_editing = prompt_data.get('allowEditing', False)
    
    if not enable_navigation or not submission_prompt_id:
        print(f"❌ Navigation prompt missing required configuration")
        return
    
    # Get group assignments
    groups_to_students = self._group_students_by_assignment()
    if not groups_to_students:
        print(f"❌ No group assignments found for navigation")
        return
    
    # Get submission data for each group
    navigation_data = await self._prepare_navigation_data_by_group(
        submission_prompt_id, 
        groups_to_students
    )
    
    # Send to each student with their group's submissions
    sent_count = 0
    for student in self.students.values():
        if student.status == "disconnected":
            continue
        
        group_name = student.group_info.get('group_name') if student.group_info else None
        if not group_name or group_name not in navigation_data:
            print(f"⚠️ Student {student.user_name} has no group or no submission data")
            continue
        
        group_submissions = navigation_data[group_name]
        
        # Prepare prompt with navigation data
        student_prompt = {
            **prompt_data,
            'groupSubmissions': group_submissions,
            'currentSubmissionIndex': 0,
            'totalSubmissions': len(group_submissions),
            'currentStudentName': group_submissions[0]['studentName'] if group_submissions else None,
            'currentSubmission': group_submissions[0]['submission'] if group_submissions else None,
            'allowEditing': allow_editing
        }
        
        await student.send_message({
            'type': 'send_prompt',
            'prompt': student_prompt
        })
        sent_count += 1
    
    # Also send to roomcast displays with group-specific data
    await self._broadcast_navigation_to_roomcast(prompt_data, navigation_data)
    
    # Store current navigation state
    self.navigation_state = {
        'prompt_id': prompt_data.get('id'),
        'submission_prompt_id': submission_prompt_id,
        'allow_editing': allow_editing,
        'navigation_data': navigation_data
    }
    
    self.current_prompt = prompt_data
    await self._save_session_state()
    
    print(f"🧭 Navigation prompt sent to {sent_count} students")


async def _prepare_navigation_data_by_group(
    self, 
    submission_prompt_id: str, 
    groups_to_students: Dict[str, List]
) -> Dict[str, List[Dict[str, Any]]]:
    """
    Prepare navigation data for each group by fetching their members' submissions.
    Returns: {group_name: [{ studentName, submission }, ...]}
    """
    navigation_data = {}
    
    for group_name, students_in_group in groups_to_students.items():
        if group_name == "No Group":
            continue
        
        group_submissions = []
        
        # Fetch each student's submission
        for student in students_in_group:
            student_name = student.user_name
            
            # Get submission data for this student
            submission = await self._fetch_student_submission(
                student_name, 
                submission_prompt_id
            )
            
            if submission:
                group_submissions.append({
                    'studentName': student_name,
                    'userId': student.user_id,
                    'submission': submission
                })
        
        navigation_data[group_name] = group_submissions
    
    print(f"🧭 Prepared navigation data for {len(navigation_data)} groups")
    return navigation_data


async def _fetch_student_submission(
    self, 
    student_name: str, 
    submission_prompt_id: str
) -> Optional[Dict[str, Any]]:
    """
    Fetch a specific student's submission for a given submission prompt.
    Returns the submission data (e.g., websiteInfo JSON object).
    """
    if not self._submission_data:
        # Try to refresh submission data from database
        self._submission_data = self._get_submission_data_from_database()
    
    if not self._submission_data:
        print(f"⚠️ No submission data available")
        return None
    
    # Find the student's submission
    students = self._submission_data.get('students', [])
    for student in students:
        if student.get('name') == student_name:
            # Look for the specific submission prompt
            submission_responses = student.get('submission_responses', {})
            
            # Parse submission_prompt_id to get the index
            # Format: "submission_0", "submission_1", etc.
            if submission_responses:
                # Try direct key match first
                if submission_prompt_id in submission_responses:
                    response = submission_responses[submission_prompt_id]
                    return self._parse_submission_response(response)
                
                # Try extracting index and building key
                try:
                    if '_' in submission_prompt_id:
                        parts = submission_prompt_id.split('_')
                        index = parts[-1]
                        key = f"submission_{index}"
                        if key in submission_responses:
                            response = submission_responses[key]
                            return self._parse_submission_response(response)
                except:
                    pass
    
    print(f"⚠️ No submission found for {student_name} prompt {submission_prompt_id}")
    return None


def _parse_submission_response(self, response: Dict[str, Any]) -> Dict[str, Any]:
    """Parse a submission response into a structured format"""
    media_type = response.get('media_type', '')
    
    if media_type == 'websiteInfo':
        # Parse JSON response for websiteInfo
        try:
            response_str = response.get('response', '{}')
            if isinstance(response_str, str):
                parsed = json.loads(response_str)
                return {
                    'type': 'websiteInfo',
                    'data': parsed
                }
        except json.JSONDecodeError:
            print(f"❌ Failed to parse websiteInfo JSON")
            return None
    
    # Handle other media types
    return {
        'type': media_type,
        'data': response.get('response', '')
    }


async def handle_navigation_action(
    self, 
    user_id: str, 
    action: str, 
    data: Dict[str, Any]
):
    """
    Handle navigation actions from students (next, previous, edit).
    Actions are broadcast to all students in the same group and roomcast.
    """
    student = self.students.get(user_id)
    if not student or not student.group_info:
        print(f"❌ Student {user_id} not found or has no group")
        return
    
    group_name = student.group_info.get('group_name')
    if not group_name or not self.navigation_state:
        print(f"❌ No active navigation state")
        return
    
    navigation_data = self.navigation_state.get('navigation_data', {})
    group_submissions = navigation_data.get(group_name, [])
    
    if not group_submissions:
        print(f"❌ No submissions found for group {group_name}")
        return
    
    current_index = data.get('currentIndex', 0)
    total_submissions = len(group_submissions)
    
    # Handle different actions
    if action == 'navigate_next':
        new_index = min(current_index + 1, total_submissions - 1)
    elif action == 'navigate_previous':
        new_index = max(current_index - 1, 0)
    elif action == 'navigate_to':
        new_index = max(0, min(data.get('index', 0), total_submissions - 1))
    else:
        print(f"❌ Unknown navigation action: {action}")
        return
    
    # Get the new submission to display
    current_submission = group_submissions[new_index]
    
    # Broadcast navigation update to all students in the group
    await self._broadcast_navigation_update_to_group(
        group_name,
        new_index,
        current_submission
    )
    
    # Also broadcast to roomcast for this group
    await self._broadcast_navigation_update_to_roomcast_group(
        group_name,
        new_index,
        current_submission
    )
    
    print(f"🧭 Navigation: {action} by {student.user_name} -> index {new_index}")


async def handle_submission_edit(
    self, 
    user_id: str, 
    edit_data: Dict[str, Any]
):
    """
    Handle submission edit from a student.
    Updates the submission and broadcasts to group members and roomcast.
    """
    student = self.students.get(user_id)
    if not student or not student.group_info:
        print(f"❌ Student {user_id} not found or has no group")
        return
    
    # Check if editing is allowed
    if not self.navigation_state or not self.navigation_state.get('allow_editing'):
        print(f"❌ Editing not allowed in current navigation state")
        return
    
    group_name = student.group_info.get('group_name')
    submission_index = edit_data.get('submissionIndex')
    updated_data = edit_data.get('updatedData')
    
    # Update the submission in navigation data
    navigation_data = self.navigation_state.get('navigation_data', {})
    group_submissions = navigation_data.get(group_name, [])
    
    if submission_index >= len(group_submissions):
        print(f"❌ Invalid submission index: {submission_index}")
        return
    
    # Update the submission
    group_submissions[submission_index]['submission']['data'] = updated_data
    
    # Broadcast update to all students in the group
    await self._broadcast_submission_update_to_group(
        group_name,
        submission_index,
        updated_data
    )
    
    # Broadcast to roomcast
    await self._broadcast_submission_update_to_roomcast_group(
        group_name,
        submission_index,
        updated_data
    )
    
    # Optionally save the edit to database
    await self._save_submission_edit_to_database(
        student_name=group_submissions[submission_index]['studentName'],
        submission_prompt_id=self.navigation_state.get('submission_prompt_id'),
        updated_data=updated_data
    )
    
    print(f"✏️ Submission edited by {student.user_name} for index {submission_index}")


async def _broadcast_navigation_update_to_group(
    self, 
    group_name: str, 
    new_index: int,
    current_submission: Dict[str, Any]
):
    """Broadcast navigation update to all students in a group"""
    for student in self.students.values():
        if (student.status != "disconnected" and 
            student.group_info and 
            student.group_info.get('group_name') == group_name):
            
            await student.send_message({
                'type': 'navigation_update',
                'currentIndex': new_index,
                'currentSubmission': current_submission
            })


async def _broadcast_submission_update_to_group(
    self, 
    group_name: str, 
    submission_index: int,
    updated_data: Dict[str, Any]
):
    """Broadcast submission edit to all students in a group"""
    for student in self.students.values():
        if (student.status != "disconnected" and 
            student.group_info and 
            student.group_info.get('group_name') == group_name):
            
            await student.send_message({
                'type': 'submission_updated',
                'submissionIndex': submission_index,
                'updatedData': updated_data
            })


async def _broadcast_navigation_to_roomcast(
    self, 
    prompt_data: Dict[str, Any],
    navigation_data: Dict[str, List[Dict[str, Any]]]
):
    """Broadcast navigation prompt to roomcast displays"""
    for ws, group_name in self._roomcast_ws_lookup.items():
        if group_name in navigation_data:
            group_submissions = navigation_data[group_name]
            
            await ws.send_json({
                'type': 'roomcast_navigation_prompt',
                'prompt': {
                    **prompt_data,
                    'groupSubmissions': group_submissions,
                    'currentSubmissionIndex': 0,
                    'currentSubmission': group_submissions[0] if group_submissions else None
                }
            })


async def _broadcast_navigation_update_to_roomcast_group(
    self, 
    group_name: str, 
    new_index: int,
    current_submission: Dict[str, Any]
):
    """Broadcast navigation update to roomcast for a specific group"""
    for ws, ws_group_name in self._roomcast_ws_lookup.items():
        if ws_group_name == group_name:
            await ws.send_json({
                'type': 'roomcast_navigation_update',
                'currentIndex': new_index,
                'currentSubmission': current_submission
            })


async def _broadcast_submission_update_to_roomcast_group(
    self, 
    group_name: str, 
    submission_index: int,
    updated_data: Dict[str, Any]
):
    """Broadcast submission edit to roomcast for a specific group"""
    for ws, ws_group_name in self._roomcast_ws_lookup.items():
        if ws_group_name == group_name:
            await ws.send_json({
                'type': 'roomcast_submission_updated',
                'submissionIndex': submission_index,
                'updatedData': updated_data
            })


async def _save_submission_edit_to_database(
    self,
    student_name: str,
    submission_prompt_id: str,
    updated_data: Dict[str, Any]
):
    """Save edited submission back to the database"""
    if not self._db_session or not self._parent_page_deployment:
        print(f"⚠️ Cannot save edit: no database session or parent deployment")
        return
    
    try:
        # This would integrate with the prompt submission system
        # to update the stored submission data
        print(f"💾 Saving edit for {student_name} submission {submission_prompt_id}")
        # Implementation would depend on existing database structure
        # TODO: Implement actual database update logic
    except Exception as e:
        print(f"❌ Error saving submission edit: {e}")
