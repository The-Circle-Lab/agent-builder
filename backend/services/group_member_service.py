from typing import List, Dict, Any, Optional, Tuple
from sqlmodel import Session, select
from models.database.grouping_models import GroupAssignment, Group, GroupMember
from database.database import get_session
from datetime import datetime, timezone


class GroupMemberService:
    """
    Service for managing group members after groups have been created.
    """
    
    @staticmethod
    def get_available_students(assignment_id: int, db_session: Session) -> List[Dict[str, str]]:
        """
        Get students who are not currently assigned to any group in this assignment.
        This requires getting all students from the original student data and filtering
        out those already assigned.
        
        Args:
            assignment_id: The group assignment ID
            db_session: Database session
            
        Returns:
            List of available students with their information
        """
        # Get the assignment
        assignment = db_session.get(GroupAssignment, assignment_id)
        if not assignment:
            raise ValueError(f"Assignment with ID {assignment_id} not found")
        
        # Get all currently assigned students
        stmt = (
            select(GroupMember.student_name)
            .join(Group)
            .where(Group.assignment_id == assignment_id)
            .where(GroupMember.is_active == True)
            .where(Group.is_active == True)
        )
        assigned_students = set(db_session.exec(stmt).all())
        
        # For now, we'll need to get the original student data from the deployment
        # This is a simplified implementation - in a real system, you'd want to
        # store the original student list or get it from the source
        # TODO: Implement actual student lookup from deployment/class roster
        
        # Return empty list for now - this will be populated in the API endpoint
        # where we have access to the full deployment context
        return []
    
    @staticmethod
    def get_assignment_groups_with_member_counts(assignment_id: int, db_session: Session) -> List[Dict[str, Any]]:
        """
        Get all groups in an assignment with their current member counts.
        
        Args:
            assignment_id: The group assignment ID
            db_session: Database session
            
        Returns:
            List of groups with member counts
        """
        stmt = (
            select(Group)
            .where(Group.assignment_id == assignment_id)
            .where(Group.is_active == True)
        )
        groups = db_session.exec(stmt).all()
        
        result = []
        for group in groups:
            # Count active members
            member_stmt = (
                select(GroupMember)
                .where(GroupMember.group_id == group.id)
                .where(GroupMember.is_active == True)
            )
            members = db_session.exec(member_stmt).all()
            
            result.append({
                "group_id": group.id,
                "group_name": group.group_name,
                "group_number": group.group_number,
                "current_member_count": len(members),
                "members": [{"student_name": m.student_name, "student_text": m.student_text} for m in members]
            })
        
        return result
    
    @staticmethod
    def add_member_to_group(
        assignment_id: int,
        student_name: str,
        student_text: Optional[str],
        target_group_id: Optional[int],
        db_session: Session
    ) -> Dict[str, Any]:
        """
        Add a student to a group, prioritizing unbalanced groups if no specific group is specified.
        
        Args:
            assignment_id: The group assignment ID
            student_name: Name/email of the student to add
            student_text: Optional text content from the student
            target_group_id: Optional specific group ID, if None will choose best group
            db_session: Database session
            
        Returns:
            Result dictionary with success status and details
        """
        # Get the assignment
        assignment = db_session.get(GroupAssignment, assignment_id)
        if not assignment:
            raise ValueError(f"Assignment with ID {assignment_id} not found")
        
        # Check if student is already assigned to any group in this assignment
        existing_member_stmt = (
            select(GroupMember)
            .join(Group)
            .where(Group.assignment_id == assignment_id)
            .where(GroupMember.student_name == student_name)
            .where(GroupMember.is_active == True)
            .where(Group.is_active == True)
        )
        existing_member = db_session.exec(existing_member_stmt).first()
        
        if existing_member:
            return {
                "success": False,
                "error": f"Student {student_name} is already assigned to a group in this assignment"
            }
        
        # Get all groups with their current member counts
        groups_info = GroupMemberService.get_assignment_groups_with_member_counts(assignment_id, db_session)
        
        if not groups_info:
            return {
                "success": False,
                "error": "No groups found in this assignment"
            }
        
        # Determine target group
        if target_group_id:
            # Use specified group
            target_group = next((g for g in groups_info if g["group_id"] == target_group_id), None)
            if not target_group:
                return {
                    "success": False,
                    "error": f"Group with ID {target_group_id} not found"
                }
        else:
            # Find the best group to add the student to
            target_group = GroupMemberService._find_best_group_for_new_member(
                groups_info, assignment.group_size_target
            )
        
        # Create the new group member
        new_member = GroupMember(
            group_id=target_group["group_id"],
            student_name=student_name,
            student_text=student_text,
            created_at=datetime.now(timezone.utc),
            is_active=True
        )
        
        db_session.add(new_member)
        
        # Update the assignment's total student count
        assignment.total_students += 1
        db_session.add(assignment)
        
        try:
            db_session.commit()
            return {
                "success": True,
                "group_id": target_group["group_id"],
                "group_name": target_group["group_name"],
                "new_member_count": target_group["current_member_count"] + 1,
                "message": f"Successfully added {student_name} to {target_group['group_name']}"
            }
        except Exception as e:
            db_session.rollback()
            return {
                "success": False,
                "error": f"Failed to add student to group: {str(e)}"
            }
    
    @staticmethod
    def _find_best_group_for_new_member(groups_info: List[Dict[str, Any]], target_size: int) -> Dict[str, Any]:
        """
        Find the best group to add a new member to, prioritizing unbalanced groups.
        
        Args:
            groups_info: List of group information with member counts
            target_size: Target group size from the original assignment
            
        Returns:
            The group dictionary that should receive the new member
        """
        # Separate groups into different categories
        undersized_groups = [g for g in groups_info if g["current_member_count"] < target_size]
        target_sized_groups = [g for g in groups_info if g["current_member_count"] == target_size]
        oversized_groups = [g for g in groups_info if g["current_member_count"] > target_size]
        
        # Priority 1: Add to undersized groups (smallest first)
        if undersized_groups:
            return min(undersized_groups, key=lambda g: g["current_member_count"])
        
        # Priority 2: Add to target-sized groups (maintaining balance)
        if target_sized_groups:
            return target_sized_groups[0]  # Just pick the first one
        
        # Priority 3: Add to oversized groups (smallest first)
        if oversized_groups:
            return min(oversized_groups, key=lambda g: g["current_member_count"])
        
        # Fallback: shouldn't happen, but return first group
        return groups_info[0]
    
    @staticmethod
    def remove_member_from_group(member_id: int, db_session: Session) -> Dict[str, Any]:
        """
        Remove a student from a group (soft delete).
        
        Args:
            member_id: The group member ID to remove
            db_session: Database session
            
        Returns:
            Result dictionary with success status and details
        """
        member = db_session.get(GroupMember, member_id)
        if not member:
            return {
                "success": False,
                "error": f"Member with ID {member_id} not found"
            }
        
        # Get group and assignment info for the response
        group = db_session.get(Group, member.group_id)
        assignment = db_session.get(GroupAssignment, group.assignment_id) if group else None
        
        # Soft delete the member
        member.is_active = False
        db_session.add(member)
        
        # Update the assignment's total student count
        if assignment:
            assignment.total_students -= 1
            db_session.add(assignment)
        
        try:
            db_session.commit()
            return {
                "success": True,
                "student_name": member.student_name,
                "group_name": group.group_name if group else "Unknown",
                "message": f"Successfully removed {member.student_name} from {group.group_name if group else 'group'}"
            }
        except Exception as e:
            db_session.rollback()
            return {
                "success": False,
                "error": f"Failed to remove student from group: {str(e)}"
            }
