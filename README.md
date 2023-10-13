
# iac-pulumi

 

1.  download aws cli

    ```https://aws.amazon.com/cli/```

    ```aws version``` to check version

 

    create user account for admin and provide administrative rights

 

2. install pulumi

    ```choco install pulumi```

    ```pulumi version``` to check version

 

3. set the pulumi locally & configure the user account

    ```pulumi login --local```

       - select -> aws:javascript

           - create a stack with proper project name & accessKey

    ```pulumi config set aws:accessKey <AccessKey>```

    ```pulumi config set --secret  aws:secretKey <your_secret_key>```

    ```pulumi config set aws:region <region>```

 

4. modify pulumi.demo.yaml file with the values of your interest of the variables, subnets, region, availablity zones, CIDR range for VPC and Subnets, no. of public or private subnets etc.


5. to execute the resources

    ```pulumi up```

    to destroy the resources

    ```pulumi destroy```

    and to refresh the resources

    ```pulumi refresh```
