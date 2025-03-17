// src/components/CollapsibleTree.js
import React, { useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';

// Move this helper function outside the component to avoid dependency warnings.
function convertToD3HierarchyRecursive(obj, name = "node") {
  const node = { name };
  if (Array.isArray(obj)) {
    node.children = obj.map(item => ({
      name: item.item_name, // use item_name for display on leaf nodes
      ...item
    }));
  } else if (typeof obj === "object") {
    node.children = Object.keys(obj).map(key =>
      convertToD3HierarchyRecursive(obj[key], key)
    );
  }
  return node;
}

function CollapsibleTree() {
  const svgRef = useRef(null);
  const treeContainerRef = useRef(null);
  const [selectedLeaf, setSelectedLeaf] = useState(null);
  const [dataLoaded, setDataLoaded] = useState(null);

  // 1. Load CSV data from file and parse it
  useEffect(() => {
    // In this example, the CSV is placed in src/components/data.csv.
    // Adjust the path if you move the CSV file (for example to public/).
    d3.csv("/data.csv").then(rawData => {
      // Build a hierarchy object based on the classification_heirarchy field.
      console.log("CSV loaded:", rawData);
      console.table(rawData);

      const hierarchyObj = buildHierarchy(rawData);
      console.log("Hierarchy object:", hierarchyObj);
      console.table(hierarchyObj);

      // Convert the object into a D3-friendly hierarchy.
      // Wrap the hierarchy with a dummy root so that the visible tree starts at the first level.
      const d3Data = convertToD3HierarchyRecursive(hierarchyObj, "root");
      // Remove the dummy root label.
      const dummyRoot = { name: "ROOT", children: d3Data.children };
      setDataLoaded(dummyRoot);
    }).catch(error => {
      console.error("Error loading CSV:", error);
    });
  }, []);

  // Build a nested object from the CSV rows.
  // Expected CSV columns: asset_id, leaf, similarity_score, item_name, classification_heirarchy
  function buildHierarchy(data) {
    const root = {};
    data.forEach(row => {
      const classification = row["classification_heirarchy"];
      if (!classification) return;
      // Split the classification string by "->" and trim.
      const parts = classification.split("->").map(part => part.trim());
      let currentLevel = root;
      parts.forEach((part, index) => {
        // At the final level, add the row as a leaf.
        if (index === parts.length - 1) {
          if (!currentLevel[part]) {
            currentLevel[part] = [];
          }
          const asset_id = row.asset_id;
          const imageurl = `https://hwajjala-simple-access.s3.amazonaws.com/hwajjala/mats_thumbnails/assets/${asset_id}.png`;
          const asset_link = `http://roblox.com/catalog/${asset_id}`;
          currentLevel[part].push({
            asset_id,
            leaf: row.leaf,
            similarity_score: row.similarity_score,
            item_name: row.item_name,
            imageurl,
            asset_link
          });
        } else {
          if (!currentLevel[part]) {
            currentLevel[part] = {};
          }
          currentLevel = currentLevel[part];
        }
      });
    });
    return root;
  }

  // 2. D3 Tree Drawing
  useEffect(() => {
    if (!dataLoaded) return; // wait for CSV load

    const margin = { top: 20, right: 90, bottom: 30, left: 90 };
    const containerWidth = treeContainerRef.current
      ? treeContainerRef.current.offsetWidth
      : 600;
    const width = containerWidth - margin.left - margin.right;
    const height = 600 - margin.top - margin.bottom;

    // Clear previous SVG content.
    d3.select(svgRef.current).selectAll("*").remove();

    // Append SVG element.
    const svg = d3.select(svgRef.current)
                  .attr("width", containerWidth)
                  .attr("height", 600)
                  .append("g")
                  .attr("transform", `translate(${margin.left},${margin.top})`);

    // Create the root node.
    const root = d3.hierarchy(dataLoaded, d => d.children);
    root.x0 = height / 2;
    root.y0 = 0;

    let i = 0;
    const duration = 750;

    // Collapse deeper levels for branch nodes.
    function collapse(d) {
      if (d.children) {
        d._children = d.children;
        d._children.forEach(collapse);
        d.children = null;
      }
    }

    // Auto-collapse deeper levels but keep first level (children of dummy root) expanded.
    if (root.children) {
      root.children.forEach(child => {
        if (child.children) {
          collapse(child);
        }
      });
    }

    update(root);

    function update(source) {
      const treeLayout = d3.tree().size([height, width]);
      const treeData = treeLayout(root);
      const nodes = treeData.descendants();
      const links = treeData.descendants().slice(1);

      // Set fixed depth.
      nodes.forEach(d => { d.y = d.depth * 180; });

      // --- Nodes Section ---
      const node = svg.selectAll('g.node')
                      .data(nodes, d => d.id || (d.id = ++i));

      const nodeEnter = node.enter().append('g')
                          .attr('class', 'node')
                          .attr("transform", d => `translate(${source.y0},${source.x0})`)
                          .on('click', click);

      nodeEnter.append('circle')
               .attr('class', 'node')
               .attr('r', 1e-6)
               .style("fill", d => d._children ? "lightsteelblue" : "#fff");

      nodeEnter.append('text')
               .attr("dy", ".35em")
               .attr("x", d => d._children ? -13 : 13)
               .attr("text-anchor", d => d._children ? "end" : "start")
               .text(d => d.parent ? d.data.name : "");

      const nodeUpdate = nodeEnter.merge(node);

      nodeUpdate.transition()
                .duration(duration)
                .attr("transform", d => `translate(${d.y},${d.x})`);

      // Highlight the selected leaf.
      nodeUpdate.select('circle.node')
                .attr('r', 10)
                .style("fill", d => d._children ? "lightsteelblue" : "#fff")
                .style("stroke", d => (selectedLeaf && d.id === selectedLeaf.id) ? "orange" : "steelblue")
                .style("stroke-width", d => (selectedLeaf && d.id === selectedLeaf.id) ? "4px" : "3px")
                .attr('cursor', 'pointer');

      node.exit().transition()
          .duration(duration)
          .attr("transform", d => `translate(${source.y},${source.x})`)
          .remove()
          .select('circle')
          .attr('r', 1e-6)
          .select(function() {
            // remove text as well
            d3.select(this.parentNode).select('text').style('fill-opacity', 1e-6);
          });

      // --- Links Section ---
      svg.selectAll('path.link')
         .data(links, d => d.id)
         .enter().insert('path', "g")
         .attr("class", "link")
         .attr('d', d => {
           const o = { x: source.x0, y: source.y0 };
           return diagonal(o, o);
         })
         .merge(svg.selectAll('path.link'))
         .transition()
         .duration(duration)
         .attr('d', d => diagonal(d, d.parent));

      svg.selectAll('path.link')
         .exit().transition()
         .duration(duration)
         .attr('d', d => {
           const o = { x: source.x, y: source.y };
           return diagonal(o, o);
         })
         .remove();

      // Save old positions for transition.
      nodes.forEach(d => {
        d.x0 = d.x;
        d.y0 = d.y;
      });
    }

    // Generate a curved path from parent to child.
    function diagonal(d, parent) {
      const path = `M ${d.y} ${d.x}
                    C ${(d.y + parent.y) / 2} ${d.x},
                      ${(d.y + parent.y) / 2} ${parent.x},
                      ${parent.y} ${parent.x}`;
      return path;
    }

    // Toggle children on click.
    // If node has further levels, expand/collapse it.
    // Otherwise (leaf), show details.
    function click(event, d) {
      // If node is a leaf, highlight and show its details.
      if (!d.children && !d._children) {
        setSelectedLeaf(d);
        return;
      } else {
        setSelectedLeaf(null);
      }
      if (d.children) {
        d._children = d.children;
        d.children = null;
      } else {
        d.children = d._children;
        d._children = null;
      }
      update(d);
    }
  }, [dataLoaded, selectedLeaf]);

  // Update highlighting when selectedLeaf changes.
  useEffect(() => {
    d3.select(svgRef.current)
      .selectAll('circle.node')
      .style("stroke", d => (selectedLeaf && d.id === selectedLeaf.id) ? "orange" : "steelblue")
      .style("stroke-width", d => (selectedLeaf && d.id === selectedLeaf.id) ? "4px" : "3px");
  }, [selectedLeaf]);

  // 3. Render Layout
  return (
    <div style={{ display: 'flex', minHeight: '100vh' }}>
      {/* Tree Section */}
      <div
        ref={treeContainerRef}
        style={{
          flex: selectedLeaf ? '0 0 60%' : '1',
          borderRight: '2px solid #ccc',
          paddingRight: '10px',
          minHeight: '100vh'
        }}
      >
        <svg ref={svgRef} style={{ width: '100%', height: '600px' }}></svg>
      </div>
      {/* Details Panel Section */}
      {selectedLeaf && (
        <div
          style={{
            flex: '0 0 300px',
            borderLeft: '2px solid #ccc',
            paddingLeft: '10px',
            minHeight: '100vh',
            overflowY: 'auto'
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
            <button
              onClick={() => setSelectedLeaf(null)}
              style={{ fontSize: '16px', padding: '2px 6px', cursor: 'pointer' }}
            >
              X
            </button>
          </div>
          <h3>{selectedLeaf.data.name}</h3>
          {selectedLeaf.data.asset_id && (
            <div style={{ textAlign: 'center', marginBottom: '10px' }}>
              <a href={selectedLeaf.data.asset_link} target="_blank" rel="noopener noreferrer">
                <img src={selectedLeaf.data.imageurl} alt={selectedLeaf.data.item_name} width={100} height={100} />
              </a>
            </div>
          )}
          {selectedLeaf.data.asset_id && (
            <p style={{ textAlign: 'center' }}>
              <a href={selectedLeaf.data.asset_link} target="_blank" rel="noopener noreferrer">
                View Asset
              </a>
            </p>
          )}
        </div>
      )}
    </div>
  );
}

export default CollapsibleTree;
