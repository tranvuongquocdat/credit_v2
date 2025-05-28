'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { PermissionNode } from '@/models/permission';
import { getAllPermissionIds } from '@/lib/permission';
import { cn } from '@/lib/utils';

interface TreeCheckboxProps {
  nodes: PermissionNode[];
  onSelectionChange: (selectedIds: string[]) => void;
  selectedIds: string[];
}

interface TreeNodeProps {
  node: PermissionNode;
  onToggle: (nodeId: string, checked: boolean) => void;
  expandedNodes: Set<string>;
  onExpandToggle: (nodeId: string) => void;
}

function TreeNode({ node, onToggle, expandedNodes, onExpandToggle }: TreeNodeProps) {
  const hasChildren = node.children && node.children.length > 0;
  const isExpanded = expandedNodes.has(node.id);
  const indentLevel = (node.level || 0) * 24;

  const handleCheckboxChange = (checked: boolean) => {
    onToggle(node.id, checked);
  };

  const handleExpandClick = () => {
    if (hasChildren) {
      onExpandToggle(node.id);
    }
  };

  return (
    <div className="select-none">
      <div 
        className="flex items-center py-1 hover:bg-gray-50 rounded-sm transition-colors"
        style={{ paddingLeft: `${indentLevel + 8}px` }}
      >
        {/* Expand/Collapse Icon */}
        <div className="w-6 h-6 flex items-center justify-center mr-1">
          {hasChildren ? (
            <button
              onClick={handleExpandClick}
              className="p-1 hover:bg-gray-200 rounded transition-colors"
            >
              {isExpanded ? (
                <ChevronDown className="h-3 w-3 text-gray-600" />
              ) : (
                <ChevronRight className="h-3 w-3 text-gray-600" />
              )}
            </button>
          ) : (
            <div className="w-4 h-4" />
          )}
        </div>

        {/* Checkbox */}
        <Checkbox
          checked={node.checked || false}
          onCheckedChange={handleCheckboxChange}
          className={cn(
            "mr-2",
            node.indeterminate && "data-[state=checked]:bg-blue-500 data-[state=checked]:border-blue-500"
          )}
          style={{
            opacity: node.indeterminate ? 0.6 : 1
          }}
        />

        {/* Label */}
        <label 
          className={cn(
            "text-sm cursor-pointer flex-1 leading-5",
            node.level === 0 ? "font-medium text-gray-900" : "text-gray-700"
          )}
          onClick={() => handleCheckboxChange(!node.checked)}
        >
          {node.name}
        </label>
      </div>

      {/* Children */}
      {hasChildren && isExpanded && (
        <div className="ml-2">
          {node.children!.map((child) => (
            <TreeNode
              key={child.id}
              node={child}
              onToggle={onToggle}
              expandedNodes={expandedNodes}
              onExpandToggle={onExpandToggle}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function TreeCheckbox({ nodes, onSelectionChange, selectedIds }: TreeCheckboxProps) {
  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(
    new Set(nodes.map(node => node.id)) // Mở rộng tất cả root nodes mặc định
  );

  const handleExpandToggle = (nodeId: string) => {
    const newExpanded = new Set(expandedNodes);
    if (newExpanded.has(nodeId)) {
      newExpanded.delete(nodeId);
    } else {
      newExpanded.add(nodeId);
    }
    setExpandedNodes(newExpanded);
  };

  const handleNodeToggle = (nodeId: string, checked: boolean) => {
    const findNode = (nodes: PermissionNode[], id: string): PermissionNode | null => {
      for (const node of nodes) {
        if (node.id === id) return node;
        if (node.children) {
          const found = findNode(node.children, id);
          if (found) return found;
        }
      }
      return null;
    };

    const node = findNode(nodes, nodeId);
    if (!node) return;

    let newSelectedIds = [...selectedIds];

    if (checked) {
      // Thêm node và tất cả children
      const allIds = getAllPermissionIds(node);
      allIds.forEach(id => {
        if (!newSelectedIds.includes(id)) {
          newSelectedIds.push(id);
        }
      });
    } else {
      // Xóa node và tất cả children
      const allIds = getAllPermissionIds(node);
      newSelectedIds = newSelectedIds.filter(id => !allIds.includes(id));
    }

    onSelectionChange(newSelectedIds);
  };

  return (
    <div className="space-y-1">
      {nodes.map((node) => (
        <TreeNode
          key={node.id}
          node={node}
          onToggle={handleNodeToggle}
          expandedNodes={expandedNodes}
          onExpandToggle={handleExpandToggle}
        />
      ))}
    </div>
  );
} 