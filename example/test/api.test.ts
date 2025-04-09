import { describe, it } from 'mocha';
import { expect } from 'chai';
import { apiClient } from '../../build/index.js';

describe('API Test with OpenAPI Coverage', () => {
  it('should track and record API calls during test execution', async () => {
    // Using the exported apiClient which is pre-configured
    // to automatically track API requests for coverage reporting
    const response = await apiClient.get('https://jsonplaceholder.typicode.com/users');

    // Regular test assertions
    expect(response.status).to.equal(200);
    expect(response.data).to.be.an('array');
    expect(response.data.length).to.be.greaterThan(0);

    // Make another API call to test more endpoints
    const postResponse = await apiClient.post('https://jsonplaceholder.typicode.com/posts', {
      title: 'Test Post',
      body: 'This is a test post',
      userId: 1,
    });

    expect(postResponse.status).to.equal(201);
    expect(postResponse.data).to.have.property('id');

    // Test a parametrized endpoint - this will be normalized to /users/{id}
    const userResponse = await apiClient.get('https://jsonplaceholder.typicode.com/users/1');
    expect(userResponse.status).to.equal(200);
    expect(userResponse.data).to.have.property('id', 1);

    // Make a request to the comments endpoint with an ID
    // This matches our custom pattern in wdio.conf.ts
    const commentResponse = await apiClient.get('https://jsonplaceholder.typicode.com/comments/1');
    expect(commentResponse.status).to.equal(200);
    expect(commentResponse.data).to.have.property('id', 1);

    // Update a post to test the PUT method
    const updateResponse = await apiClient.put('https://jsonplaceholder.typicode.com/posts/1', {
      title: 'Updated Title',
      body: 'Updated content',
      userId: 1,
    });
    expect(updateResponse.status).to.equal(200);
    expect(updateResponse.data).to.have.property('title', 'Updated Title');

    // Delete a post to test the DELETE method
    const deleteResponse = await apiClient.delete('https://jsonplaceholder.typicode.com/posts/1');
    expect(deleteResponse.status).to.equal(200);

    // Intentionally trigger a 404 (not found) error
    // This will be tracked but won't affect the test
    try {
      await apiClient.get('https://jsonplaceholder.typicode.com/nonexistent-endpoint');
    } catch (_e) {
      // Error is expected
      console.log('Expected 404 error was caught');
    }

    // The OpenAPI Coverage Service automatically tracks these requests
    // and will generate a coverage report at the end of test execution
  });
});
