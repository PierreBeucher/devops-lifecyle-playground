.PHONY=infra aws k8s-await k8s-kubeconfig whoami ssh destroy traefik datadog
n ?= 10
KUBECONFIG ?= ${PWD}/infra/.kubeconfig.yml

#
# Infra
#

infra: aws k8s-await k8s-kubeconfig traefik

aws:
	# Deploy AWS infra
	pulumi -C infra/aws up -s dev -yfr

k8s-await:	
	# Wait for K3S to be installed
	@ n=$(n); \
	while [ $${n} -gt 0 ] ; do \
	    echo "Checking for K3S installation... ($$n attempts remaining)"; \
		ssh -i infra/aws/.ssh/dev ubuntu@k3s-1.devops.crafteo.io k3s --version && break; \
		n=`expr $$n - 1`; \
		sleep 10; \
	done; \
	
k8s-kubeconfig:	
	@echo "K3S found. Retrieving Kubeconfig..."
	scp -i infra/aws/.ssh/dev ubuntu@k3s-1.devops.crafteo.io:/etc/rancher/k3s/k3s.yaml ${KUBECONFIG}

	# replace 127.0.0.1 by your domain name
	sed -i 's/127.0.0.1/k3s-1.devops.crafteo.io/g' ${KUBECONFIG}

	@echo "K3S Kubernetes cluster is ready! Use Kubeconfig ${KUBECONFIG}"
	@echo "Run 'export KUBECONFIG=${KUBECONFIG}'"

traefik:
	KUBECONFIG="${KUBECONFIG}" pulumi -C infra/traefik up -s dev -yfr

datadog:
	KUBECONFIG="${KUBECONFIG}" pulumi -C infra/datadog up -s dev -yfr

efk: helm-repo-elastic elasticsearch kibana fluentd

helm-repo-elastic:
	helm repo add elastic https://helm.elastic.co

elasticsearch:
	helm upgrade --install -n efk -f infra/efk/values-elasticsearch.yml elasticsearch elastic/elasticsearch

kibana:
	helm upgrade --install -n efk -f infra/efk/values-kibana.yml kibana elastic/kibana

fluentd:
	helm repo add fluent https://fluent.github.io/helm-charts
	helm upgrade --install -n efk -f infra/efk/values-fluentd.yml fluentd fluent/fluentd
	

#
# Applications
#

whoami:
	KUBECONFIG="${KUBECONFIG}" kubectl apply -k deploy/whoami/base 

vote:
	KUBECONFIG="${KUBECONFIG}" kubectl apply -f deploy/vote/base/namespace.yml
	KUBECONFIG="${KUBECONFIG}" kubectl apply -n vote -k deploy/vote/base 

ssh:
	ssh -i infra/aws/.ssh/dev ubuntu@k3s-1.devops.crafteo.io

destroy:
	@echo "Are you sure you want to destroy?"
	@read destroyit
	KUBECONFIG="${KUBECONFIG}" pulumi -C infra/k8s destroy -s dev -yfr
	pulumi -C infra/aws destroy -s dev -yfr