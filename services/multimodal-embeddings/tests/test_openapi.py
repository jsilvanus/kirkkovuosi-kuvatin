from fastapi.testclient import TestClient

from multimodal_embeddings.api import app


def test_openapi_endpoint_matches_checked_in_contract():
    with TestClient(app) as client:
        response = client.get('/openapi.json')
    assert response.status_code == 200
    schema = response.json()
    assert schema['openapi'] == '3.1.0'
    assert set(schema['paths']) == {
        '/health', '/v1/models', '/v1/jobs/text', '/v1/jobs/image', '/v1/jobs/{job_id}'
    }
    assert schema['paths']['/v1/jobs/text']['post']['operationId'] == 'createTextJob'
    assert schema['components']['schemas']['JobStatus']['enum'] == ['queued', 'running', 'complete', 'failed']
    model_schema = schema['components']['schemas']['ModelsResponse']
    assert {'image_revision', 'text_revision'} <= set(model_schema['required'])
    assert model_schema['properties']['image_revision']['type'] == 'string'
    assert model_schema['properties']['text_revision']['type'] == 'string'
