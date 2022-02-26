import Iter from 'es-iter';

import _ from 'lodash';
import Graph from '../../data-structures/graph/Graph.js';
import GraphVertex from '../../data-structures/graph/GraphVertex.js';
import GraphEdge from '../../data-structures/graph/GraphEdge.js';
import { getUniques, getAllIndexes } from '../arrays/arrays.js';

export const describeBlueprint = (blueprint) => {
  const bp_graph = parseBlueprintToGraph(blueprint);
  const node_ids_per_type = {};

  const types = ['start', 'finish', 'systemtask', 'subprocess',
    'scripttask', 'flow', 'usertask'];

  for (const type of types) {
    node_ids_per_type[type] = [];

    getBlueprintNodesByType(blueprint, type).forEach(
      (node) => {
        node_ids_per_type[type].push(node.id);
      },
    );
  }

  const start_finish_nodes = startAndFinishNodes(blueprint);
  let reachable_nodes = {};
  let non_reachable_nodes = {};

  const workflow_finish_reachability = {};
  
  for (const start_node_key of start_finish_nodes.start_nodes) {
    workflow_finish_reachability[start_node_key] = [];

    reachable_nodes[start_node_key] = bp_graph.convertVerticesIndexestoKeys(bp_graph.reachableNodes(start_node_key));
    
    const reachable_finish_nodes = _.intersection(
      reachable_nodes[start_node_key],
      start_finish_nodes.finish_nodes,
    );

    non_reachable_nodes[start_node_key]=_.difference(bp_graph.getAllVerticesKeys(), reachable_nodes[start_node_key])

    if (reachable_finish_nodes.length != 0) {
      workflow_finish_reachability[start_node_key] = reachable_finish_nodes;
    }
  }

  return {
    name: blueprint.name,
    description: blueprint.description,
    node_ids_per_type,
    reachable_from_start: reachable_nodes,
    non_reachable_from_start: non_reachable_nodes,
    reachable_finish_from_start: workflow_finish_reachability,
    graph: bp_graph.describe(),
  };
};

export const getBlueprintNodesByType = (blueprint, type) => {
  const { nodes } = blueprint.blueprint_spec;
  const nodes_per_type = [];

  for (const node of nodes) {
    if (node.type.toLowerCase() === type) {
      nodes_per_type.push(node);
    }
  }

  return nodes_per_type;
};

export const parseBlueprintToGraph = (blueprint) => {
  const { nodes } = blueprint.blueprint_spec;
  const graph = new Graph(true);
  const vertices_dict = {};

  for (let i = 0; i < nodes.length; i += 1) {
    vertices_dict[nodes[i].id] = new GraphVertex(nodes[i].id);
  }

  const edges = [];

  // Iterate along array elements
  for (let i = 0; i < nodes.length; i += 1) {
    if (nodes[i].next != null) {
      // Flow case
      if (typeof (nodes[i].next) === 'object') {
        const next_values = getUniques(Object.values(nodes[i].next));

        for (let j = 0; j < next_values.length; j += 1) {
          const edge = new GraphEdge(
            vertices_dict[nodes[i].id],
            vertices_dict[next_values[j]],
          );
          edges.push(edge);
        }
      } else {
      // Ordinary edge

        const edge = new GraphEdge(
          vertices_dict[nodes[i].id],
          vertices_dict[nodes[i].next],
        );
        edges.push(edge);
      }
    }
  }

  graph.addEdges(edges);

  return graph;
};

export const startAndFinishNodes = (blueprint) => {
  const { nodes } = blueprint.blueprint_spec;
  const startNodes = [];
  const finishNodes = [];

  for (const node of nodes) {
    if (node.type.toLowerCase() === 'start') {
      startNodes.push(node.id);
    }

    if (node.type.toLowerCase() === 'finish') {
      finishNodes.push(node.id);
    }
  }

  return { start_nodes: [...startNodes], finish_nodes: [...finishNodes] };
};

export const nodeToLane = (blueprint) => {
  const { nodes } = blueprint.blueprint_spec;
  const node_to_lane = {};

  for (const node of nodes) {
    node_to_lane[node.id] = node.lane_id;
  }

  return node_to_lane;
};

export const nodeRouteToLaneRoute = (
  node_route,
  vertices_indices_to_keys,
  node_id_to_lane,
) => {
  const lane_route = [];

  for (const vertex_j of node_route) {
    const lane_vertex_j = node_id_to_lane[vertices_indices_to_keys[vertex_j]];

    if (lane_route.length == 0) {
      lane_route.push(lane_vertex_j);
    } else if (lane_route[lane_route.length - 1] !== lane_vertex_j) {
      lane_route.push(lane_vertex_j);
    } else {
      continue;
    }
  }

  return lane_route;
};

export const fromStartToFinishAllPaths = (blueprint, start_key, finish_key) => {
  const bp_graph = parseBlueprintToGraph(blueprint);
  const node_id_to_lane = nodeToLane(blueprint);

  const looseNodes = bp_graph.looseNodes();
  const orphanNodes = bp_graph.orphanNodes();
  const vertices_keys_to_indices = bp_graph.getVerticesKeystoIndices();
  const vertices_indices_to_keys = bp_graph.getVerticesIndicestoKeys();

  const start_index = vertices_keys_to_indices[start_key];
  const finish_index = vertices_keys_to_indices[finish_key];

  let is_undefined = false;
  if (start_index === undefined) {
    console.warn(`Warning: Claimed start vertex key ${start_key} is not available within nodes`);
    is_undefined = true;
  }

  if (finish_index === undefined) {
    console.warn(`Warning: Claimed finish vertex key ${finish_key} is not available within nodes`);
    is_undefined = true;
  }

  if (is_undefined) {
    return [];
  }

  if (getAllIndexes(orphanNodes, start_index).length === 0) {
    console.warn(`Vertex id ${start_index} is not a start node! Detected start nodes: ${orphanNodes}`);

    return [];
  }

  if (getAllIndexes(looseNodes, finish_index).length === 0) {
    console.warn(`Vertex id ${finish_index} is not a finish node! Detected finish nodes: ${looseNodes}`);

    return [];
  }

  const routes = bp_graph.allPaths(start_key, finish_key);
  const route_describe = {
    length: routes.length,
    routes: [],
  };

  let lane_route_i = [];

  for (const i in routes) {
    lane_route_i = nodeRouteToLaneRoute(routes[i], vertices_indices_to_keys, node_id_to_lane);

    route_describe.routes.push(
      {
        nodes_path: bp_graph.convertVerticesIndexestoKeys(routes[i]),
        lanes_path: lane_route_i,
      },
    );
  }

  return route_describe;
};

export const fromStartToFinishCombsAllPaths = (blueprint) => {
  const sf_nodes = startAndFinishNodes(blueprint);

  const paths = {};
  let startNode;
  let finishNode;

  for (const i of Iter.range(sf_nodes.start_nodes.length)) {
    startNode = sf_nodes.start_nodes[i];
    for (const j of Iter.range(sf_nodes.finish_nodes.length)) {
      finishNode = sf_nodes.finish_nodes[j];

      const label = `${startNode}_${finishNode}`;
      paths[label] = fromStartToFinishAllPaths(blueprint, startNode, finishNode);
    }
  }

  return paths;
};

export const parseWorkflowXMLToGraph = () => {
  throw Error('Not implemented');
};
