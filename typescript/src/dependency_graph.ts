import { Placeholder, PluginConfig } from "./parse_settings";
import { replace_placeholder_in_string } from "./replacer";


const recursive_add_placeholders_to_list = (list: Placeholder[], node: GraphNode) => {
    if (!list.includes(node.placeholder)) {
        list.push(node.placeholder);
        // Also add all downstream dependencies to the list
        for (const child of node.downlinks) {
            recursive_add_placeholders_to_list(list, child);
        }
    }
}

// Should be a directed acyclical graph
export class DependencyGraph {
    private nodes: Map<string, GraphNode>;

    constructor(placeholders: Map<string, Placeholder>) {
        this.nodes = new Map<string, GraphNode>();
        for (const placeholder of placeholders.values()) {
            this.nodes.set(placeholder.name, new GraphNode(placeholder));
        }
        // Needs to be in different loops to ensure that all nodes have been created first
        for (const placeholder of placeholders.values()) {
            this.on_placeholder_value_change(placeholder);
        }

        // Make sure that all expanded values are calculated
        // We take every node with no downlinks (bottom of the graph) and do a recursive recalculation (upwards).
        // Not super efficient, but simple to implement
        for (const node of this.nodes.values()) {
            if (node.downlinks.length == 0) {
                node.recalculate_expanded_value(true);
            }
        }
    }

    unmark_everything(): void {
        for (const node of this.nodes.values()) {
            node.marked = false;
        }
    }

    get_node(placeholder: Placeholder): GraphNode {
        const node = this.nodes.get(placeholder.name);
        if (node == undefined) {
            throw new Error(`Placeholder ${placeholder.name} is not part of the dependency graph`);
        } else {
            return node;
        }
    }

    on_placeholder_value_change(placeholder: Placeholder) {
        const node = this.get_node(placeholder);
        this.update_placeholder_downlinks(placeholder);
        
        if (this.has_loop()) {
            // Emergency measure: ignore any placeholders in this value. This should fix the loop
            placeholder.expanded_value = placeholder.current_value;
            node.downlinks = [];
            
            // Also raise an exception to inform the user
            throw new Error(`Placeholder ${placeholder.name} was part of a loop and has temporarily been made non-recursive`);
        } else {
            node.recalculate_expanded_value(true);
        }
    }

    update_placeholder_downlinks(placeholder: Placeholder) {
        if (placeholder.allow_recursive == false) {
            // By definition, non-recursive placeholders can not rely on other placeholders
            return;
        }

        // Step 1: remove all old downlinks
        const node = this.get_node(placeholder);
        for (const old_downlink of node.downlinks) {
            old_downlink.remove_uplink(node)
        }
        node.downlinks = [];
        
        // Step 2: parse placeholder's value (again)
        for (const other_node of this.nodes.values()) {
            // No placeholder should directly be able to contain itself -> ignoring this case.
            // This should lead to the placeholder's name appearing in it's text, which was probably intended
            if (other_node != node) {
                if (string_contains_placeholder(placeholder.current_value, other_node.placeholder)) {
                    // This placeholders value contains a reference to the other node's placeholder
                    //  -> This node depends on the other node
                    node.downlinks.push(other_node);
                }
            }
        }
    }

    get_all_used_placeholders(): Placeholder[] {
        // Also includes all placeholders used by the placeholders that were included
        const list: Placeholder[] = [];
        for (const node of this.nodes.values()) {
            if (node.placeholder.count_on_page > 0) {
                // Also add all downstream dependencies to the list
                recursive_add_placeholders_to_list(list, node);
            }
        }
        return list;
    }

    has_loop() {
        // General algorithm: https://www.geeksforgeeks.org/detect-cycle-in-a-graph/
        this.unmark_everything();
        for (const node of this.nodes.values()) {
            // Make sure that we check every single node (we likely have multiple graphs that are not connected)
            if (!node.marked) {
                if (this._has_loop([], node)) {
                    return true;
                }
            }
        }
        return false;
    }

    private _has_loop(back_stack: GraphNode[], current_node: GraphNode): boolean {
        const new_back_stack = [...back_stack, current_node];
        const index = back_stack.indexOf(current_node);
        if (index != -1) {
            let message = "Dependency cycle in placeholders detected:";
            for (let i = index; i < new_back_stack.length; i++) {
                const placeholder = new_back_stack[i].placeholder;
                message += `\n$ -> ${placeholder.name}: ${placeholder.current_value}`;
            }
            console.warn(message);
            return true;
        } else if (!current_node.marked) {
            // No cycle found yet, scan all children that are not yet marked
            current_node.marked = true;
            for (const child of current_node.downlinks) {
                if (this._has_loop(new_back_stack, child)) {
                    return true;
                }
            }
            return false;
        } else {
            // Already checked, so no need to start recursive scans
            return false;
        }

    }
}

const string_contains_placeholder = (string_to_test: string, placeholder_to_find: Placeholder): boolean => {
    return placeholder_to_find.regex_dynamic.test(string_to_test) ||
            placeholder_to_find.regex_html.test(string_to_test) ||
            placeholder_to_find.regex_normal.test(string_to_test) ||
            placeholder_to_find.regex_static.test(string_to_test);
}

class GraphNode {
    // This is the placeholder associated with this node
    placeholder: Placeholder;
    // These other nodes depend on this node
    uplinks: GraphNode[] = [];
    // This are the nodes this node depends on
    downlinks: GraphNode[] = [];
    // State used during operations to see if this node was already visited/processed
    marked: boolean = false;

    constructor(placeholder: Placeholder) {
        this.placeholder = placeholder;
    }

    remove_uplink(node: GraphNode): void {
        this.uplinks = this.uplinks.filter(x => x != node);
    }

    recalculate_expanded_value(recursive: boolean) {
        let expanded_value = this.placeholder.current_value;
        for (const downlink_node of this.downlinks) {
            expanded_value = replace_placeholder_in_string(expanded_value, downlink_node.placeholder);
        }
        this.placeholder.expanded_value = expanded_value;

        if (recursive) {
            // Recalculate all uplink nodes in recursive too
            for (const uplink_node of this.uplinks) {
                uplink_node.recalculate_expanded_value(recursive);
            }
        }
    }
}

