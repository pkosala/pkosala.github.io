// src/components/CollapsibleTree.js
import React, { useRef, useEffect, useState } from 'react';
import * as d3 from 'd3';

// Your CSV data
const csvData = `level1,level2,leaf,asset_id,name,imageurl
Electronics,Phones,iPhone,123,Apple iPhone,https://via.placeholder.com/100
Electronics,Phones,Galaxy,124,Samsung Galaxy,https://via.placeholder.com/100
Electronics,Laptops,MacBook,125,Apple MacBook,https://via.placeholder.com/100
Electronics,Laptops,XPS,126,Dell XPS,https://via.placeholder.com/100
Home,Kitchen,Blender,127,Ninja Blender,https://via.placeholder.com/100
Home,Living Room,Sofa,128,Comfort Sofa,https://via.placeholder.com/100`;

// Convert CSV data into a nested hierarchy object.
function csvToHierarchy(csvData) {
  const lines = csvData.split('\n').filter(line => line.trim() !== '');
  const headers = lines[0].split(',').map(h => h.trim());
  const hierarchy = {};

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',').map(v => v.trim());
    const row = headers.reduce((acc, header, index) => {
      acc[header] = values[index];
      return acc;
    }, {});

    const { level1, level2, leaf, asset_id, name, imageurl } = row;
    if (!hierarchy[level1]) {
      hierarchy[level1] = {};
    }
    if (!hierarchy[level1][level2]) {
      hierarchy[level1][level2] = [];
    }
    hierarchy[level1][level2].push({ leaf, asset_id, name, imageurl });
  }
  return hierarchy;
}

// Convert the hierarchy object into a D3-friendly format.
function convertToD3Hierarchy(hierarchy) {
  return {
    name: "root",
    children: Object.entries(hierarchy).map(([level1, level2Obj]) => ({
      name: level1,
      children: Object.entries(level2Obj).map(([level2, leaves]) => ({
        name: level2,
        children: leaves.map(item => ({
          name: item.leaf,
          ...item
        }))
      }))
    }))
  };
}

function CollapsibleTree() {
  const svgRef = useRef(null);
  const treeContainerRef = useRef(null);
  // Store the entire D3 node for the selected leaf.
  const [selectedLeaf, setSelectedLeaf] = useState(null);

  // Dummy images (simulate S3 images)
  const dummyImages = [
    "https://via.placeholder.com/100",
    "https://via.placeholder.com/100",
    "https://via.placeholder.com/100"
  ];

  // ----------------------------
  // D3 Tree Drawing (runs only once)
  // ----------------------------
  useEffect(() => {
    // Dimensions for the tree.
    const margin = { top: 20, right: 90, bottom: 30, left: 90 };
    const containerWidth = treeContainerRef.current
      ? treeContainerRef.current.offsetWidth
      : 600;
    const width = containerWidth - margin.left - margin.right;
    const height = 600 - margin.top - margin.bottom;

    // Clear previous SVG contents.
    d3.select(svgRef.current).selectAll("*").remove();

    // Prepare data.
    const hierarchyObj = csvToHierarchy(csvData);
    const data = convertToD3Hierarchy(hierarchyObj);

    // Append SVG and group.
    const svg = d3.select(svgRef.current)
                  .attr("width", containerWidth)
                  .attr("height", 600)
                  .append("g")
                  .attr("transform", `translate(${margin.left},${margin.top})`);

    // Create the root node.
    const root = d3.hierarchy(data, d => d.children);
    root.x0 = height / 2;
    root.y0 = 0;

    let i = 0;
    const duration = 750;

    // Collapse node and all its children.
    function collapse(d) {
      if (d.children) {
        d._children = d.children;
        d._children.forEach(collapse);
        d.children = null;
      }
    }

    // Initially collapse all children of the root (but not the root itself)
    if (root.children) {
      root.children.forEach(collapse);
    }

    // Main update function.
    function update(source) {
      const treeLayout = d3.tree().size([height, width]);
      const treeData = treeLayout(root);
      const nodes = treeData.descendants();
      const links = treeData.descendants().slice(1);

      // Fixed depth for each node.
      nodes.forEach(d => {
        d.y = d.depth * 180;
      });

      // -------- Nodes Section --------
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
               .text(d => d.data.name);

      const nodeUpdate = nodeEnter.merge(node);

      nodeUpdate.transition()
                .duration(duration)
                .attr("transform", d => `translate(${d.y},${d.x})`);

      // Highlight selected leaf: if this node matches the selected leaf, change stroke.
      nodeUpdate.select('circle.node')
                .attr('r', 10)
                .style("fill", d => d._children ? "lightsteelblue" : "#fff")
                .style("stroke", d => (selectedLeaf && d.id === selectedLeaf.id) ? "orange" : "steelblue")
                .style("stroke-width", d => (selectedLeaf && d.id === selectedLeaf.id) ? "4px" : "3px")
                .attr('cursor', 'pointer');

      const nodeExit = node.exit().transition()
                         .duration(duration)
                         .attr("transform", d => `translate(${source.y},${source.x})`)
                         .remove();

      nodeExit.select('circle')
              .attr('r', 1e-6);
      nodeExit.select('text')
              .style('fill-opacity', 1e-6);

      // -------- Links Section --------
      const link = svg.selectAll('path.link')
                      .data(links, d => d.id);

      const linkEnter = link.enter().insert('path', "g")
                            .attr("class", "link")
                            .attr('d', d => {
                              const o = { x: source.x0, y: source.y0 };
                              return diagonal(o, o);
                            });

      const linkUpdate = linkEnter.merge(link);

      linkUpdate.transition()
                .duration(duration)
                .attr('d', d => diagonal(d, d.parent));

      const linkExit = link.exit().transition()
                         .duration(duration)
                         .attr('d', d => {
                           const o = { x: source.x, y: source.y };
                           return diagonal(o, o);
                         })
                         .remove();

      // Save the old positions for transition.
      nodes.forEach(d => {
        d.x0 = d.x;
        d.y0 = d.y;
      });
    }

    // Diagonal generator for links.
    function diagonal(d, parent) {
      const path = `M ${d.y} ${d.x}
                    C ${(d.y + parent.y) / 2} ${d.x},
                      ${(d.y + parent.y) / 2} ${parent.x},
                      ${parent.y} ${parent.x}`;
      return path;
    }

    // Toggle children on click.
    function click(event, d) {
      // If a leaf node is clicked, do not toggle the tree; just set it as selected.
      if (!d.children && !d._children) {
        setSelectedLeaf(d);
        return;
      } else {
        // If a branch is clicked, clear any leaf selection.
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

    // Initial render.
    update(root);
  }, []); // Run once on mount

  // ----------------------------
  // Update Highlighting when selectedLeaf changes (without redrawing the whole tree)
  // ----------------------------
  useEffect(() => {
    d3.select(svgRef.current)
      .selectAll('circle.node')
      .style("stroke", d => (selectedLeaf && d.id === selectedLeaf.id) ? "orange" : "steelblue")
      .style("stroke-width", d => (selectedLeaf && d.id === selectedLeaf.id) ? "4px" : "3px");
  }, [selectedLeaf]);

  // ----------------------------
  // Render
  // ----------------------------
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
              style={{
                fontSize: '16px',
                padding: '2px 6px',
                cursor: 'pointer'
              }}
            >
              X
            </button>
          </div>
          <h3>{selectedLeaf.data.name}</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap' }}>
            {dummyImages.map((img, index) => (
              <div key={index} style={{ margin: '5px', textAlign: 'center' }}>
                <img src={img} alt={selectedLeaf.data.name} width={100} height={100} />
                <p style={{ fontSize: '0.8em' }}>{selectedLeaf.data.name}</p>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default CollapsibleTree;
