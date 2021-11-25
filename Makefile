.PHONY=deploy-dev
n ?= 10
KUBECONFIG ?= ${PWD}/infra/k8s/.kubeconfig.yml
deploy-dev:
	# Deploy AWS infra
	pulumi -C infra/aws up -s dev -yfr
	
	# Wait for K3S to be installed
	n=$(n); \
	while [ $${n} -gt 0 ] ; do \
	    echo "Checking for K3S installation... ($$n attempts remaining)"; \
		ssh -i infra/aws/.ssh/dev ubuntu@k3s-1.devops.crafteo.io k3s --version && break; \
		n=`expr $$n - 1`; \
		sleep 10; \
	done; \
	
	@echo "K3S found. Retrieving Kubeconfig..."
	scp -i infra/aws/.ssh/dev ubuntu@k3s-1.devops.crafteo.io:/etc/rancher/k3s/k3s.yaml ${KUBECONFIG}

	# replace 127.0.0.1 by your domain name
	sed -i 's/127.0.0.1/k3s-1.devops.crafteo.io/g' ${KUBECONFIG}

	# check server is available with nodes
	kubectl get no

	# Deploy kubernetes resources (Traefik, Cert Manager...)
	pulumi -C infra/k8s up -s dev -yf

	# Deploy application
	kubectl -k deploy/kustomize/base/ apply


