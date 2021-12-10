.PHONY=infra aws k8s 
n ?= 10
KUBECONFIG ?= ${PWD}/infra/k8s/.kubeconfig.yml

infra: aws k8s-await k8s-kubeconfig k8s

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

k8s:
	# Deploy kubernetes resources (Traefik, Cert Manager...)
	KUBECONFIG="${KUBECONFIG}" pulumi -C infra/k8s up -s dev -yfr

whoami:
	KUBECONFIG="${KUBECONFIG}" kubectl apply -k deploy/whoami/base 

ssh:
	ssh -i infra/aws/.ssh/dev ubuntu@k3s-1.devops.crafteo.io